/**
 * Stella Local Brain API Client Service (Step 3.7)
 *
 * Provides a minimal, secure, typed HTTP interface to Stella's local Python brain.
 *
 * SECURITY INVARIANTS:
 * 1. Targets strictly loopback (http://127.0.0.1:8000). Never connects to external or cloud APIs.
 * 2. Session IDs are validated client-side and scoped to the browser tab session (sessionStorage).
 * 3. Model output is treated as strictly UNTRUSTED.
 * 4. Action proposals are informational only; the UI never executes proposed actions directly
 *    and never attempts to bypass the Permission Gateway.
 * 5. Handles timeouts, network disconnections, and safe error reporting.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  cantarellaExpressionController,
  CantarellaExpressionName,
  CantarellaConversationState,
} from '../components/CompanionPanel/CantarellaExpressionController';

import {
  cantarellaLipSyncController,
} from '../components/CompanionPanel/CantarellaLipSync';

export type { CantarellaConversationState };

/**
 * Update the avatar's conversation lifecycle state (idle, listening, thinking, speaking).
 */
export function setConversationState(state: CantarellaConversationState): void {
  cantarellaExpressionController.setConversationState(state);
}

/**
 * Get current avatar conversation lifecycle state.
 */
export function getConversationState(): CantarellaConversationState {
  return cantarellaExpressionController.getConversationState();
}

/**
 * Returns true if the companion overlay window is currently active.
 */
export function isCompanionOverlayActive(): boolean {
  if (typeof window === 'undefined' || !window.stellaDesktop) return false;
  if (window.stellaDesktop.windowType === 'companion') return true;
  if (typeof document !== 'undefined' && document.body.classList.contains('companion-overlay-active')) {
    return true;
  }
  return false;
}


export const BRAIN_API_BASE_URL = 'http://127.0.0.1:8000';
export const HEALTH_TIMEOUT_MS = 2500;
export const TURN_TIMEOUT_MS = 90000;

/**
 * Normalizes loopback URLs to IPv4 http://127.0.0.1.
 * Prevents browser ERR_CONNECTION_REFUSED caused by Windows dual-stack IPv6 [::1]
 * resolution when the Python server is bound to IPv4 127.0.0.1.
 */
export function normalizeLoopbackBaseUrl(url: string = BRAIN_API_BASE_URL): string {
  if (!url || !url.trim()) return BRAIN_API_BASE_URL;
  return url
    .trim()
    .replace(/^http:\/\/localhost(?=[:/]|$)/i, 'http://127.0.0.1')
    .replace(/^http:\/\/\[::1\](?=[:/]|$)/i, 'http://127.0.0.1')
    .replace(/\/+$/, ''); // Strip trailing slashes
}

export interface ActionProposalSummary {
  proposal_id: string;
  action_name: string;
  parameters: Record<string, unknown>;
  intent_summary: string;
  risk_level: string;
}

export interface ConfirmationPromptSummary {
  prompt_id: string;
  proposal_id: string;
  action_name: string;
  summary: string;
  affected_targets: string[];
  risk_level: string;
}

export interface TurnResponsePayload {
  turn_id: string;
  session_id: string;
  status: 'completed' | 'awaiting_confirmation' | 'plan_generated' | 'failed';
  user_facing_text: string;
  expression_hint?: string | null;
  proposed_actions: ActionProposalSummary[];
  confirmation_prompts: ConfirmationPromptSummary[];
  duration_ms: number;
  error_message?: string | null;
}

export interface HealthResponsePayload {
  status: 'ok' | 'degraded';
  fsm_state: string;
  model: string;
  ollama_connected?: boolean;
  ollama_reachable?: boolean;
  version: string;
  port?: number;
}

export interface TurnRequestPayload {
  user_message: string;
  session_id?: string;
  perceptual_state?: Record<string, unknown>;
}

/**
 * Returns a stable session identifier scoped to this browser session.
 */
export function getOrCreateSessionId(): string {
  const SESSION_STORAGE_KEY = 'stella_local_session_id';
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_\-]+$/.test(existing)) {
      return existing;
    }
    const freshId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, freshId);
    return freshId;
  } catch {
    return `session_${Date.now()}_fallback`;
  }
}

/**
 * Probe the health of the local Stella brain HTTP service.
 */
export async function checkBrainHealth(baseUrl: string = BRAIN_API_BASE_URL): Promise<HealthResponsePayload | null> {
  const normalizedUrl = normalizeLoopbackBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalizedUrl}/api/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as HealthResponsePayload;
    return {
      ...data,
      ollama_reachable: data.ollama_connected ?? data.ollama_reachable ?? false,
    };
  } catch {
    // Network error, connection refused, or timeout: brain service is offline
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispatch a conversational turn to Stella's local brain orchestrator.
 */
export async function sendTurn(
  payload: TurnRequestPayload,
  baseUrl: string = BRAIN_API_BASE_URL
): Promise<TurnResponsePayload> {
  const normalizedUrl = normalizeLoopbackBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

  const sessionId = payload.session_id || getOrCreateSessionId();

  try {
    const response = await fetch(`${normalizedUrl}/api/turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        user_message: payload.user_message,
        session_id: sessionId,
        perceptual_state: payload.perceptual_state || {},
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.message) {
          errorDetail = errJson.message;
        }
      } catch {
        // Fall back to HTTP status
      }
      throw new Error(`Brain request failed: ${errorDetail}`);
    }

    const data = (await response.json()) as TurnResponsePayload;
    return data;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Brain turn timed out after ${TURN_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps model expression hint string to Cantarella blend shape expression name.
 */
export function mapExpressionHintToCantarella(hint?: string | null): CantarellaExpressionName {
  if (!hint) return 'neutral';
  const clean = hint.toLowerCase().trim();
  switch (clean) {
    case 'happy':
    case 'joy':
    case 'pleased':
    case 'glad':
      return 'happy';
    case 'sad':
    case 'sorrow':
    case 'grief':
      return 'sad';
    case 'angry':
    case 'annoyed':
      return 'angry';
    case 'playful':
    case 'fun':
    case 'cheerful':
    case 'amused':
      return 'playful';
    case 'shy':
    case 'bashful':
    case 'affectionate':
      return 'shy';
    case 'curious':
    case 'inquisitive':
    case 'thinking':
    case 'attentive':
      return 'curious';
    case 'neutral':
    default:
      return 'neutral';
  }
}

/**
 * Apply model expression hint to the avatar expression controller if supported.
 * Without a forced premature 4s reset, allowing the emotion to persist gracefully
 * through speech playback and into the emotional idle resting state.
 */
export function applyExpressionHint(hint?: string | null, holdDuration?: number): void {
  try {
    const targetExpr = mapExpressionHintToCantarella(hint);
    cantarellaExpressionController.setExpression(targetExpr, {
      intensity: 0.85,
      duration: 0.35,
      holdDuration: holdDuration !== undefined ? holdDuration : undefined,
    });
  } catch (err) {
    console.warn('Failed to apply expression hint to avatar:', err);
  }
}

/**
 * React hook to observe local brain engine connectivity and telemetry.
 */
export function useBrainStatus(pollIntervalMs: number = 5000) {
  const [health, setHealth] = useState<HealthResponsePayload | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const checkStatus = useCallback(async () => {
    const res = await checkBrainHealth();
    if (!isMountedRef.current) return;
    setHealth(res);
    setIsOnline(res !== null && (res.status === 'ok' || res.status === 'degraded'));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    checkStatus();

    const interval = setInterval(() => {
      checkStatus();
    }, pollIntervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [checkStatus, pollIntervalMs]);

  return { health, isOnline, checkNow: checkStatus };
}

// ============================================================================
// Local Piper Text-to-Speech (TTS) Service with Lip-Sync Integration (Phase 7.5)
// ============================================================================

export const TTS_TIMEOUT_MS = 25000;

export interface TTSRequestPayload {
  text: string;
}

let sharedAudioContext: AudioContext | null = null;
let currentBufferSource: AudioBufferSourceNode | null = null;
let currentAudioElement: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;

function getOrCreateAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtxClass();
  }
  return sharedAudioContext;
}

/**
 * Immediately stop any ongoing speech playback and reset mouth lip-sync.
 */
export function stopSpeechAudio(): void {
  if (cantarellaExpressionController.getConversationState() === 'speaking') {
    cantarellaExpressionController.setConversationState('idle');
  }

  // Smoothly close mouth animation
  cantarellaLipSyncController.stopSpeech();

  if (currentBufferSource) {
    try {
      currentBufferSource.onended = null;
      currentBufferSource.stop();
      currentBufferSource.disconnect();
    } catch {
      // Ignore stop errors if already completed
    }
    currentBufferSource = null;
  }

  if (currentAudioElement) {
    try {
      currentAudioElement.onended = null;
      currentAudioElement.onerror = null;
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
      currentAudioElement.src = '';
    } catch {
      // Ignore pause errors
    }
    currentAudioElement = null;
  }

  if (currentAudioUrl) {
    try {
      URL.revokeObjectURL(currentAudioUrl);
    } catch {
      // Ignore revoke errors
    }
    currentAudioUrl = null;
  }
}

/**
 * Send speech text to the local Python brain Piper TTS endpoint.
 * Returns a WAV audio Blob.
 */
export async function synthesizeSpeech(
  text: string,
  baseUrl: string = BRAIN_API_BASE_URL
): Promise<Blob> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Speech text cannot be empty or whitespace only.');
  }

  const normalizedUrl = normalizeLoopbackBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalizedUrl}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/wav, application/json',
      },
      body: JSON.stringify({ text: trimmed }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.error) {
          errorDetail = errJson.error;
        }
      } catch {
        // Fall back to status text
      }
      throw new Error(`TTS synthesis failed: ${errorDetail}`);
    }

    return await response.blob();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`TTS synthesis timed out after ${TTS_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Safely play a WAV audio Blob using the Web Audio API connected directly
 * to the lip-sync formant analyzer and destination.
 * Resolves when playback completes or is cleanly stopped.
 */
export async function playSpeechAudio(audioBlob: Blob): Promise<void> {
  // Stop existing playback before playing new utterance
  stopSpeechAudio();

  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const audioCtx = getOrCreateAudioContext();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        currentBufferSource = source;

        // Connect source directly to lip-sync AnalyserNode, then to speakers
        const analyser = cantarellaLipSyncController.attachAudioSource(source, audioCtx);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        let hasEnded = false;
        const finish = () => {
          if (hasEnded) return;
          hasEnded = true;
          source.onended = null;
          cantarellaLipSyncController.stopSpeech();
          if (cantarellaExpressionController.getConversationState() === 'speaking') {
            cantarellaExpressionController.setConversationState('idle');
          }
          if (currentBufferSource === source) {
            currentBufferSource = null;
          }
          resolve();
        };

        source.onended = finish;

        // Enter speaking state and start lip-sync tracking
        cantarellaLipSyncController.startSpeech();
        cantarellaExpressionController.setConversationState('speaking');

        source.start(0);
      } catch (err) {
        // Fallback to HTMLAudioElement if Web Audio decode fails
        console.warn('Web Audio decode failed, falling back to HTMLAudioElement:', err);
        try {
          const blobToPlay =
            audioBlob.type === 'audio/wav'
              ? audioBlob
              : new Blob([audioBlob], { type: 'audio/wav' });
          const url = URL.createObjectURL(blobToPlay);
          const audio = new Audio();
          currentAudioElement = audio;
          currentAudioUrl = url;

          let hasCleanedUp = false;
          const cleanup = () => {
            if (hasCleanedUp) return;
            hasCleanedUp = true;
            audio.onended = null;
            audio.onerror = null;
            cantarellaLipSyncController.stopSpeech();
            if (cantarellaExpressionController.getConversationState() === 'speaking') {
              cantarellaExpressionController.setConversationState('idle');
            }
            if (currentAudioUrl === url) {
              try {
                URL.revokeObjectURL(url);
              } catch {}
              currentAudioUrl = null;
            }
            if (currentAudioElement === audio) {
              currentAudioElement = null;
            }
          };

          audio.onended = () => {
            cleanup();
            resolve();
          };

          audio.onerror = () => {
            cleanup();
            reject(new Error('Audio playback error on fallback element'));
          };

          cantarellaLipSyncController.startSpeech();
          cantarellaExpressionController.setConversationState('speaking');
          audio.src = url;
          audio.play().catch((playErr) => {
            cleanup();
            if (playErr instanceof DOMException && playErr.name === 'AbortError') {
              resolve();
              return;
            }
            reject(playErr);
          });
        } catch (fallbackErr) {
          cantarellaLipSyncController.stopSpeech();
          if (cantarellaExpressionController.getConversationState() === 'speaking') {
            cantarellaExpressionController.setConversationState('idle');
          }
          reject(fallbackErr);
        }
      }
    })();
  });
}

/**
 * High-level helper to synthesize and play text aloud with synchronized mouth movement.
 * Never throws an error out to caller; returns true on success or false on failure.
 * This guarantees TTS issues never break conversational text replies.
 */
export async function speakSpeechText(
  text: string,
  baseUrl: string = BRAIN_API_BASE_URL
): Promise<boolean> {
  try {
    const audioBlob = await synthesizeSpeech(text, baseUrl);
    await playSpeechAudio(audioBlob);
    return true;
  } catch (err) {
    console.warn('Stella local TTS synthesis/playback failed gracefully:', err);
    cantarellaLipSyncController.stopSpeech();
    if (cantarellaExpressionController.getConversationState() === 'speaking') {
      cantarellaExpressionController.setConversationState('idle');
    }
    return false;
  }
}

