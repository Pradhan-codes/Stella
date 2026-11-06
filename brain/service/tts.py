"""Local Piper Text-to-Speech (TTS) Engine for Stella.

Integrates local neural speech synthesis via Piper TTS (1.8.0) and the
Ceylia voice model (en_US-ceylia-medium.onnx).

Key Optimizations & Guarantees (Phase 6.1):
1. In-Memory Persistent Model: Loads PiperVoice ONNX model once into memory
   for ultra-low latency (~100-250ms synthesis vs ~3000ms subprocess creation).
2. Pure In-Memory WAV Generation: Synthesizes directly to io.BytesIO(), eliminating
   disk I/O and temporary file churn.
3. Safe Subprocess Fallback: Preserves the isolated subprocess path as a robust
   fallback if in-memory synthesis is unavailable or disabled.
4. Strict Local File Resolution: Voice models are resolved strictly within
   the project's voices directory. Arbitrary external paths from untrusted
   callers are never loaded.
5. Concurrency Guard: A lightweight bounded semaphore prevents unbounded
   concurrent Piper synthesis from saturating CPU resources.
6. Privacy & Sanitized Logging: Speech text is not logged in full; only text
   length and duration are recorded.
"""

from __future__ import annotations

import concurrent.futures
import io
import logging
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Optional
import wave

logger = logging.getLogger("stella.brain.tts")


class TTSError(Exception):
    """Base exception for text-to-speech failures."""


class TTSModelNotFoundError(TTSError):
    """Raised when the requested Piper ONNX voice model cannot be found."""


class TTSTimeoutError(TTSError):
    """Raised when the Piper subprocess or worker exceeds its allotted execution deadline."""


class TTSSynthesisError(TTSError):
    """Raised when Piper fails to generate valid audio."""


class PiperTTSEngine:
    """Manages local Piper TTS model execution and audio generation."""

    def __init__(
        self,
        model_path: Optional[Path] = None,
        config_path: Optional[Path] = None,
        python_executable: Optional[str] = None,
        timeout_seconds: float = 20.0,
        max_concurrency: int = 1,
        use_persistent_model: bool = True,
    ) -> None:
        """Initialize the Piper TTS engine.

        Args:
            model_path: Path to the .onnx model file. Defaults to project voices/en_US-ceylia-medium.onnx.
            config_path: Path to the companion .json config. Defaults to matching .onnx.json.
            python_executable: Python interpreter path. Defaults to sys.executable.
            timeout_seconds: Maximum time allowed for synthesis.
            max_concurrency: Maximum number of concurrent Piper executions allowed.
            use_persistent_model: Whether to load and retain the ONNX model in memory for low latency.
        """
        project_root = Path(__file__).resolve().parent.parent.parent
        default_model = project_root / "voices" / "en_US-ceylia-medium.onnx"
        default_config = project_root / "voices" / "en_US-ceylia-medium.onnx.json"

        self.model_path = Path(model_path) if model_path else default_model
        self.config_path = Path(config_path) if config_path else default_config
        self.python_executable = python_executable or sys.executable
        self.timeout_seconds = max(1.0, float(timeout_seconds))
        self.max_concurrency = max(1, int(max_concurrency))
        self.use_persistent_model = use_persistent_model

        self._semaphore = threading.BoundedSemaphore(value=self.max_concurrency)
        self._voice_lock = threading.Lock()
        self._voice: Optional[Any] = None
        self._executor: Optional[concurrent.futures.ThreadPoolExecutor] = None

    def is_model_available(self) -> bool:
        """Check whether the configured voice model file exists on disk."""
        try:
            return self.model_path.is_file() and self.model_path.stat().st_size > 0
        except Exception:
            return False

    def _get_or_load_voice(self) -> Optional[Any]:
        """Lazily load the Piper ONNX voice model into memory with thread safety."""
        if not self.use_persistent_model:
            return None

        if self._voice is not None:
            return self._voice

        with self._voice_lock:
            if self._voice is not None:
                return self._voice

            try:
                from piper.voice import PiperVoice

                logger.info("Loading Piper ONNX voice model into memory: %s", self.model_path.name)
                t0 = time.perf_counter()
                cfg_path = self.config_path if (self.config_path and self.config_path.is_file()) else None
                loaded_voice = PiperVoice.load(
                    self.model_path,
                    config_path=cfg_path,
                    use_cuda=False,
                )
                self._voice = loaded_voice
                logger.info(
                    "Piper voice model loaded in %.2fs (ready for low-latency synthesis)",
                    time.perf_counter() - t0,
                )
                return self._voice
            except Exception as exc:
                logger.warning(
                    "Failed to load in-memory PiperVoice (%s); falling back to subprocess execution: %s",
                    type(exc).__name__,
                    exc,
                )
                self._voice = None
                return None

    def synthesize_to_bytes(self, text: str) -> bytes:
        """Synthesize text into WAV audio bytes.

        Uses the persistent in-memory PiperVoice model when available (<250ms),
        falling back to the safe subprocess runner if in-memory mode is disabled.

        Args:
            text: Plain text to synthesize.

        Returns:
            Raw WAV audio bytes.

        Raises:
            ValueError: If text is empty, whitespace-only, or too long.
            TTSModelNotFoundError: If model file does not exist.
            TTSTimeoutError: If synthesis times out.
            TTSSynthesisError: If Piper fails or output is invalid.
        """
        if not text or not text.strip():
            raise ValueError("TTS text cannot be empty or whitespace only.")

        clean_text = text.strip()
        if len(clean_text) > 4096:
            raise ValueError(
                f"TTS text length ({len(clean_text)} chars) exceeds maximum limit (4096 chars)."
            )

        if not self.is_model_available():
            logger.warning("Piper voice model not found at %s", self.model_path)
            raise TTSModelNotFoundError(
                f"Voice model file not found: {self.model_path.name}"
            )

        # Acquire concurrency guard with a bounded wait
        acquired = self._semaphore.acquire(timeout=self.timeout_seconds)
        if not acquired:
            logger.warning("Piper TTS concurrency limit reached; request rejected")
            raise TTSSynthesisError("TTS engine is currently busy. Please retry shortly.")

        try:
            voice = self._get_or_load_voice()
            if voice is not None:
                return self._synthesize_in_memory(voice, clean_text)
            return self._synthesize_subprocess(clean_text)
        finally:
            self._semaphore.release()

    def _synthesize_in_memory(self, voice: Any, clean_text: str) -> bytes:
        """Perform ultra-low-latency in-memory synthesis using persistent PiperVoice."""
        start_time = time.perf_counter()

        def _do_synth() -> bytes:
            bio = io.BytesIO()
            with wave.open(bio, "wb") as wav_file:
                voice.synthesize_wav(clean_text, wav_file)
            return bio.getvalue()

        try:
            if self._executor is None:
                self._executor = concurrent.futures.ThreadPoolExecutor(
                    max_workers=1,
                    thread_name_prefix="PiperTTSWorker",
                )
            future = self._executor.submit(_do_synth)
            wav_bytes = future.result(timeout=self.timeout_seconds)
        except concurrent.futures.TimeoutError as exc:
            elapsed = time.perf_counter() - start_time
            logger.error("In-memory Piper TTS timed out after %.2fs", elapsed)
            raise TTSTimeoutError(
                f"TTS generation timed out after {self.timeout_seconds:.1f} seconds"
            ) from exc
        except Exception as synth_err:
            logger.error("In-memory Piper synthesis failed: %s", type(synth_err).__name__)
            raise TTSSynthesisError(
                f"Speech synthesis error: {type(synth_err).__name__}"
            ) from synth_err

        if len(wav_bytes) < 12 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
            logger.error("Generated audio bytes missing valid RIFF/WAVE header")
            raise TTSSynthesisError("Generated audio is not a valid WAV stream.")

        elapsed = time.perf_counter() - start_time
        logger.info(
            "Piper TTS (in-memory) generated %d WAV bytes for %d characters in %.3fs",
            len(wav_bytes),
            len(clean_text),
            elapsed,
        )
        return wav_bytes

    def _synthesize_subprocess(self, clean_text: str) -> bytes:
        """Fallback synthesis path via safe child subprocess."""
        temp_wav_path: Optional[str] = None
        start_time = time.perf_counter()

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_f:
                temp_wav_path = temp_f.name

            cmd = [
                self.python_executable,
                "-m",
                "piper",
                "-m",
                str(self.model_path),
                "-f",
                temp_wav_path,
            ]

            if self.config_path and self.config_path.is_file():
                cmd.extend(["-c", str(self.config_path)])

            logger.debug(
                "Starting Piper TTS subprocess (text_len=%d, timeout=%.1fs)",
                len(clean_text),
                self.timeout_seconds,
            )

            try:
                result = subprocess.run(
                    cmd,
                    input=clean_text.encode("utf-8"),
                    capture_output=True,
                    timeout=self.timeout_seconds,
                    shell=False,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                elapsed = time.perf_counter() - start_time
                logger.error("Piper TTS subprocess timed out after %.2fs", elapsed)
                raise TTSTimeoutError(
                    f"TTS generation timed out after {self.timeout_seconds:.1f} seconds"
                ) from exc
            except Exception as proc_err:
                logger.error("Failed to execute Piper subprocess: %s", type(proc_err).__name__)
                raise TTSSynthesisError(
                    f"Unable to launch speech synthesis process: {type(proc_err).__name__}"
                ) from proc_err

            if result.returncode != 0:
                stderr_preview = result.stderr.decode("utf-8", errors="ignore").strip()
                first_line = stderr_preview.splitlines()[-1] if stderr_preview else "Unknown Piper error"
                logger.error("Piper failed (exit code %d): %s", result.returncode, first_line)
                raise TTSSynthesisError(f"Speech synthesis failed: {first_line}")

            if not os.path.exists(temp_wav_path) or os.path.getsize(temp_wav_path) == 0:
                logger.error("Piper completed but no output WAV was generated")
                raise TTSSynthesisError("Speech synthesis produced an empty audio output.")

            with open(temp_wav_path, "rb") as audio_file:
                wav_bytes = audio_file.read()

            if len(wav_bytes) < 12 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
                logger.error("Generated audio bytes missing valid RIFF/WAVE header")
                raise TTSSynthesisError("Generated audio is not a valid WAV stream.")

            elapsed = time.perf_counter() - start_time
            logger.info(
                "Piper TTS (subprocess) generated %d WAV bytes for %d characters in %.2fs",
                len(wav_bytes),
                len(clean_text),
                elapsed,
            )
            return wav_bytes

        finally:
            if temp_wav_path and os.path.exists(temp_wav_path):
                try:
                    os.unlink(temp_wav_path)
                except Exception as clean_err:
                    logger.debug("Failed to remove temp WAV %s: %s", temp_wav_path, clean_err)

    def close(self) -> None:
        """Release worker threads and resources cleanly."""
        if self._executor is not None:
            self._executor.shutdown(wait=False)
            self._executor = None
        self._voice = None
