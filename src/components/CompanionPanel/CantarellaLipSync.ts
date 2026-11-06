import { VRM } from '@pixiv/three-vrm';

export interface LipSyncWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export interface LipSyncDiagnostics {
  isSpeaking: boolean;
  currentWeights: LipSyncWeights;
  targetWeights: LipSyncWeights;
  rms: number;
  energyLow: number;
  energyMid: number;
  energyHigh: number;
}

export type LipSyncChangeListener = (weights: LipSyncWeights) => void;

/**
 * CantarellaLipSyncController
 *
 * Lightweight, real-time speech-driven mouth animation controller for Cantarella's VRM.
 *
 * Technical Design & Invariants:
 * 1. Analyzes audio actually being played through Web Audio API (AnalyserNode).
 * 2. Does not claim phoneme-accurate lip-sync from audio amplitude alone; provides
 *    smooth, responsive, audio-driven approximate lip-sync using formant energy bands.
 * 3. Drives VRM 0.0 standard vowel expressions: 'aa', 'ih', 'ou', 'ee', 'oh'.
 * 4. Blends mouth animation orthogonally with active emotional expressions without
 *    overwriting emotional presets (happy, sad, angry, relaxed).
 * 5. Attack (fast opening) and decay (smooth closing) smoothing with clamping (max 0.82)
 *    to prevent jaw unhinging or unnatural jitter.
 * 6. Drops smoothly to rest when audio pauses, finishes, or cancels.
 */
export class CantarellaLipSyncController {
  private vrm: VRM | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;

  private isSpeakingState: boolean = false;
  private currentWeights: LipSyncWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private targetWeights: LipSyncWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

  private rms: number = 0;
  private energyLow: number = 0;
  private energyMid: number = 0;
  private energyHigh: number = 0;

  // Smoothing rates
  private attackRate: number = 24.0;
  private decayRate: number = 14.0;
  private silenceThreshold: number = 0.015;
  private maxOpeningClamp: number = 0.82;

  private listeners: Set<LipSyncChangeListener> = new Set();

  /**
   * Connect an active VRM instance to this lip-sync controller.
   */
  public attachVRM(vrm: VRM): void {
    this.vrm = vrm;
    // Ensure all mouth blendshape initial weights are cleanly zeroed
    this.resetMouthWeights();
  }

  /**
   * Detach the VRM instance.
   */
  public detachVRM(): void {
    this.resetMouthWeights();
    this.vrm = null;
  }

  /**
   * Connect an AudioNode (e.g. MediaElementAudioSourceNode or AudioBufferSourceNode)
   * to this lip-sync controller's Web Audio Analyser.
   */
  public attachAudioSource(sourceNode: AudioNode, ctx: AudioContext): AnalyserNode {
    this.audioContext = ctx;

    if (!this.analyser || this.analyser.context !== ctx) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.35;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.fftSize);
    }

    try {
      sourceNode.connect(this.analyser);
    } catch {
      // Source might already be connected
    }

    this.isSpeakingState = true;
    return this.analyser;
  }

  /**
   * Notify that speech audio has begun.
   */
  public startSpeech(): void {
    this.isSpeakingState = true;
  }

  /**
   * Immediately stop speech audio tracking and smoothly return mouth to resting pose.
   */
  public stopSpeech(): void {
    this.isSpeakingState = false;
    this.targetWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.rms = 0;
    this.energyLow = 0;
    this.energyMid = 0;
    this.energyHigh = 0;
  }

  /**
   * Reset all mouth blendshape values directly to 0.0 on the attached VRM.
   */
  public resetMouthWeights(): void {
    this.currentWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.targetWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.applyToVRM();
    this.notifyListeners();
  }

  /**
   * Update lip-sync calculations every animation frame.
   * Call from the avatar's requestAnimationFrame render loop.
   */
  public update(delta: number): void {
    if (this.isSpeakingState) {
      if (this.analyser && this.timeData && this.freqData) {
        this.analyzeAudioFrame();
      }
      // If analyser is absent, retain simulated or manual target weights
    } else {
      // Target is fully closed
      this.targetWeights.aa = 0;
      this.targetWeights.ih = 0;
      this.targetWeights.ou = 0;
      this.targetWeights.ee = 0;
      this.targetWeights.oh = 0;
    }

    // Smooth current weights toward target weights using asymmetric attack/decay
    let hasChanged = false;
    const shapes: (keyof LipSyncWeights)[] = ['aa', 'ih', 'ou', 'ee', 'oh'];

    for (const shape of shapes) {
      const target = this.targetWeights[shape];
      const current = this.currentWeights[shape];
      const rate = target > current ? this.attackRate : this.decayRate;
      const step = (target - current) * Math.min(1.0, delta * rate);
      const next = current + step;

      // Settle small residual values directly to 0
      const settled = Math.abs(next) < 0.003 ? 0 : Math.max(0, Math.min(this.maxOpeningClamp, next));
      if (Math.abs(settled - current) > 0.0005) {
        hasChanged = true;
      }
      this.currentWeights[shape] = settled;
    }

    if (hasChanged || this.isSpeakingState) {
      this.applyToVRM();
      this.notifyListeners();
    }
  }

  /**
   * Read time-domain and frequency data from Web Audio Analyser and compute vowel targets.
   */
  private analyzeAudioFrame(): void {
    if (!this.analyser || !this.timeData || !this.freqData) return;

    // 1. RMS amplitude calculation from time domain data
    this.analyser.getByteTimeDomainData(this.timeData);
    let sumSquares = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const val = (this.timeData[i] - 128) / 128;
      sumSquares += val * val;
    }
    this.rms = Math.sqrt(sumSquares / this.timeData.length);

    // If silence or punctuation pause, smoothly close mouth
    if (this.rms < this.silenceThreshold) {
      this.targetWeights.aa = 0;
      this.targetWeights.ih = 0;
      this.targetWeights.ou = 0;
      this.targetWeights.ee = 0;
      this.targetWeights.oh = 0;
      return;
    }

    // 2. Frequency domain formant energy breakdown
    this.analyser.getByteFrequencyData(this.freqData);

    // Bins with fftSize=512 at 22050Hz/44100Hz:
    // Low: bins 2-8 (approx 100Hz - 400Hz: fundamental voice pitch, closed/pursed vowels)
    // Mid: bins 9-36 (approx 400Hz - 1800Hz: open vowel formants 'aa', 'oh')
    // High: bins 37-95 (approx 1800Hz - 4500Hz: spread front vowels 'ih', 'ee', sibilants)
    let lowSum = 0;
    for (let i = 2; i <= 8; i++) {
      lowSum += this.freqData[i];
    }
    let midSum = 0;
    for (let i = 9; i <= 36; i++) {
      midSum += this.freqData[i];
    }
    let highSum = 0;
    for (let i = 37; i <= 95; i++) {
      highSum += this.freqData[i];
    }

    this.energyLow = lowSum / (7 * 255);
    this.energyMid = midSum / (28 * 255);
    this.energyHigh = highSum / (59 * 255);

    const totalBandEnergy = this.energyLow + this.energyMid + this.energyHigh;
    if (totalBandEnergy <= 0.001) {
      this.targetWeights.aa = 0;
      this.targetWeights.ih = 0;
      this.targetWeights.ou = 0;
      this.targetWeights.ee = 0;
      this.targetWeights.oh = 0;
      return;
    }

    const lowRatio = this.energyLow / totalBandEnergy;
    const midRatio = this.energyMid / totalBandEnergy;
    const highRatio = this.energyHigh / totalBandEnergy;

    // Responsive non-linear gain scaling tuned for Piper TTS speech energy
    const speechRange = Math.max(0.001, 0.065 - this.silenceThreshold);
    const normalizedRMS = Math.max(0, (this.rms - this.silenceThreshold) / speechRange);
    const speechIntensity = Math.min(1.0, Math.pow(normalizedRMS, 0.65));

    // Expressive vowel shapes:
    // 'aa': Primary jaw opening (fundamental to all voiced phonemes, accented by mid formants)
    this.targetWeights.aa = Math.min(
      this.maxOpeningClamp,
      speechIntensity * (0.35 + 0.65 * midRatio)
    );

    // 'ih': Spread mouth (dominant high frequency energy / front vowels)
    this.targetWeights.ih = Math.min(
      this.maxOpeningClamp * 0.70,
      speechIntensity * (highRatio * 1.5)
    );

    // 'ou': Pursed rounded lips (dominant low frequency fundamental pitch)
    this.targetWeights.ou = Math.min(
      this.maxOpeningClamp * 0.65,
      speechIntensity * (lowRatio * 1.4)
    );

    // 'ee': Mid-spread front vowel (combined high and mid energy)
    this.targetWeights.ee = Math.min(
      this.maxOpeningClamp * 0.65,
      speechIntensity * ((highRatio * 0.7 + midRatio * 0.3) * 1.3)
    );

    // 'oh': Rounded open vowel (combined mid and low energy)
    this.targetWeights.oh = Math.min(
      this.maxOpeningClamp * 0.75,
      speechIntensity * ((midRatio * 0.6 + lowRatio * 0.4) * 1.25)
    );
  }


  /**
   * Apply current mouth weights into the attached VRM's ExpressionManager.
   */
  private applyToVRM(): void {
    if (!this.vrm?.expressionManager) return;
    const mgr = this.vrm.expressionManager;

    mgr.setValue('aa', this.currentWeights.aa);
    mgr.setValue('ih', this.currentWeights.ih);
    mgr.setValue('ou', this.currentWeights.ou);
    mgr.setValue('ee', this.currentWeights.ee);
    mgr.setValue('oh', this.currentWeights.oh);
  }

  /**
   * Diagnostic manual override for automated testing and deterministic verification.
   */
  public setDirectWeights(weights: Partial<LipSyncWeights>): void {
    const hasPositiveWeight = Object.values(weights).some((w) => (w ?? 0) > 0);
    this.isSpeakingState = hasPositiveWeight;

    if (weights.aa !== undefined) this.targetWeights.aa = weights.aa;
    if (weights.ih !== undefined) this.targetWeights.ih = weights.ih;
    if (weights.ou !== undefined) this.targetWeights.ou = weights.ou;
    if (weights.ee !== undefined) this.targetWeights.ee = weights.ee;
    if (weights.oh !== undefined) this.targetWeights.oh = weights.oh;

    this.currentWeights = { ...this.targetWeights };
    this.applyToVRM();
    this.notifyListeners();
  }

  public getWeights(): LipSyncWeights {
    return { ...this.currentWeights };
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  public getDiagnostics(): LipSyncDiagnostics {
    return {
      isSpeaking: this.isSpeakingState,
      currentWeights: { ...this.currentWeights },
      targetWeights: { ...this.targetWeights },
      rms: this.rms,
      energyLow: this.energyLow,
      energyMid: this.energyMid,
      energyHigh: this.energyHigh,
    };
  }

  public subscribe(listener: LipSyncChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getWeights());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const weights = this.getWeights();
    this.listeners.forEach((fn) => fn(weights));
  }
}

// Module-level singleton instance for active avatar and speech playback
export const cantarellaLipSyncController = new CantarellaLipSyncController();

// Expose on window in browser / Electron environment for inspection and automated tests
if (typeof window !== 'undefined') {
  (window as unknown as { __stellaLipSyncController?: CantarellaLipSyncController }).__stellaLipSyncController =
    cantarellaLipSyncController;
}
