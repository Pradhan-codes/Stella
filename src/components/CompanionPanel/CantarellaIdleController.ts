import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import {
  CantarellaExpressionController,
  CantarellaExpressionName,
  CantarellaConversationState,
} from './CantarellaExpressionController';
import { CantarellaAnimationManager } from './CantarellaAnimationManager';

export interface IdleControllerConfig {
  /** Framing mode to set appropriate eye-height and gaze tracking plane */
  framing?: 'full' | 'portrait';
  /** Enable gentle breathing sway and natural breathing variation (default: true) */
  enableBreathing?: boolean;
  /** Enable biologically plausible blinking (default: true) */
  enableBlinking?: boolean;
  /** Enable subtle head drift (default: true) */
  enableHeadMovement?: boolean;
  /** Enable gentle eye gaze saccades and gaze tracking (default: true) */
  enableEyeGaze?: boolean;
  /** Enable subtle torso sway (default: true) */
  enableTorsoSway?: boolean;
  /** Enable autonomous periodic idle behaviors (head turns, tilts, posture shifts, small gestures) (default: true) */
  enableAutonomousIdle?: boolean;
  /** Enable emotion-aware body language response (default: true) */
  enableEmotionBodyLanguage?: boolean;
  /** Enable conversation-aware posture and speaking cadence (default: true) */
  enableConversationAnimation?: boolean;
  /** Enable random asset-based action scheduler (default: true) */
  enableRandomAssetActions?: boolean;
}

/**
 * Definition for random asset-based full-body actions (using existing project VRMA files).
 */
export interface RandomAssetActionDef {
  motionId: string;
  weight: number;
  minCooldown: number; // minimum seconds between executions of this specific action
  allowedEmotions: CantarellaExpressionName[];
  allowedFramings?: Array<'full' | 'portrait'>;
  description: string;
}

export const RANDOM_ASSET_ACTIONS: RandomAssetActionDef[] = [
  {
    motionId: 'VRMA_02',
    weight: 30,
    minCooldown: 40,
    allowedEmotions: ['neutral', 'happy', 'playful', 'curious', 'shy'],
    description: 'Polite greeting bow',
  },
  {
    motionId: 'VRMA_06',
    weight: 25,
    minCooldown: 45,
    allowedEmotions: ['neutral', 'happy', 'playful'],
    description: 'Confident runway model pose',
  },
  {
    motionId: 'VRMA_03',
    weight: 20,
    minCooldown: 50,
    allowedEmotions: ['happy', 'playful'],
    description: 'Cheerful peace sign pose',
  },
  {
    motionId: 'VRMA_04',
    weight: 15,
    minCooldown: 55,
    allowedEmotions: ['happy', 'playful'],
    description: 'Playful celestial finger-gun gesture',
  },
  {
    motionId: 'VRMA_05',
    weight: 10,
    minCooldown: 75,
    allowedEmotions: ['neutral', 'happy', 'playful'],
    allowedFramings: ['full'], // 360-degree spin is visually best in full framing
    description: 'Graceful 360-degree spin',
  },
  {
    motionId: 'VRMA_01',
    weight: 10,
    minCooldown: 60,
    allowedEmotions: ['neutral', 'happy', 'curious'],
    allowedFramings: ['full'],
    description: 'Full body presentation gesture',
  },
];

export type CantarellaGestureName = 'wave' | 'nod';

type BlinkState = 'WAITING' | 'CLOSING' | 'OPENING' | 'DOUBLE_PAUSE';

/** Types of autonomous episodic idle behaviors */
type AutonomousIdleBehaviorType =
  | 'LOOK_SIDE'
  | 'HEAD_TILT'
  | 'POSTURE_SHIFT'
  | 'DEEP_BREATH'
  | 'GENTLE_NOD';

interface ActiveAutonomousBehavior {
  type: AutonomousIdleBehaviorType;
  timer: number;
  inDuration: number;
  holdDuration: number;
  outDuration: number;
  totalDuration: number;
  // Randomized parameters for this specific execution
  targetHeadYaw: number;
  targetHeadPitch: number;
  targetHeadRoll: number;
  targetSpineYaw: number;
  targetSpinePitch: number;
  targetSpineRoll: number;
  targetGazeOffsetX: number;
  targetGazeOffsetY: number;
}

/**
 * Nuanced postural profile for emotion-aware body language.
 * All angles are in radians and calibrated to be subtle, restrained, and spring-bone friendly.
 */
export interface EmotionPostureProfile {
  headPitch: number;
  headRoll: number;
  headYaw: number;
  spinePitch: number;
  spineRoll: number;
  spineYaw: number;
  chestPitch: number;
  gazeOffsetX: number;
  gazeOffsetY: number;
  breathRateMul: number;
  breathDepthMul: number;
  torsoSwayMul: number;
}

export const EMOTION_POSTURE_PROFILES: Record<CantarellaExpressionName, EmotionPostureProfile> = {
  neutral: {
    headPitch: 0,
    headRoll: 0,
    headYaw: 0,
    spinePitch: 0,
    spineRoll: 0,
    spineYaw: 0,
    chestPitch: 0,
    gazeOffsetX: 0,
    gazeOffsetY: 0,
    breathRateMul: 1.0,
    breathDepthMul: 1.0,
    torsoSwayMul: 1.0,
  },
  happy: {
    headPitch: -0.015,  // subtle upbeat lifted angle (~ -0.85°)
    headRoll: 0.02,     // light cheerful tilt (~ +1.1°)
    headYaw: 0,
    spinePitch: -0.012, // slightly upright, lifted posture (~ -0.7°)
    spineRoll: 0,
    spineYaw: 0,
    chestPitch: -0.008,
    gazeOffsetX: 0,
    gazeOffsetY: 0.02,  // open, engaging eye gaze
    breathRateMul: 1.08,
    breathDepthMul: 1.05,
    torsoSwayMul: 1.05,
  },
  playful: {
    headPitch: -0.01,
    headRoll: 0.035,    // perky playful tilt (~ +2.0°)
    headYaw: 0.015,
    spinePitch: -0.01,
    spineRoll: 0.008,
    spineYaw: 0.008,
    chestPitch: -0.006,
    gazeOffsetX: 0.02,
    gazeOffsetY: 0.02,
    breathRateMul: 1.12,
    breathDepthMul: 1.05,
    torsoSwayMul: 1.15,
  },
  shy: {
    headPitch: 0.035,   // restrained head dip (~ +2.0°)
    headRoll: 0.02,     // modest bashful tilt
    headYaw: 0.015,
    spinePitch: 0.01,   // gentle modest inward posture (~ +0.57°)
    spineRoll: 0.008,
    spineYaw: 0.008,
    chestPitch: 0.006,
    gazeOffsetX: 0.18,   // sideways gaze deflection away from camera
    gazeOffsetY: -0.05,  // slightly downcast gaze
    breathRateMul: 1.0,
    breathDepthMul: 0.85, // soft, quiet breathing
    torsoSwayMul: 0.75,
  },
  curious: {
    headPitch: -0.008,
    headRoll: 0.045,    // brief inquisitive tilt (~ +2.6°)
    headYaw: 0.01,
    spinePitch: 0.012,  // attentive posture, leaning subtly toward user
    spineRoll: 0.01,
    spineYaw: 0.008,
    chestPitch: 0.006,
    gazeOffsetX: 0,     // attentive gaze directly focused on camera/user
    gazeOffsetY: 0,
    breathRateMul: 0.95,
    breathDepthMul: 0.95,
    torsoSwayMul: 0.8,   // attentive, steady focus
  },
  sad: {
    headPitch: 0.028,   // head gently lowered (~ +1.6°)
    headRoll: -0.01,
    headYaw: 0,
    spinePitch: 0.022,  // gentler, softened posture (~ +1.25°)
    spineRoll: 0,
    spineYaw: 0,
    chestPitch: 0.015,
    gazeOffsetX: 0,
    gazeOffsetY: -0.04,  // softly downcast gaze
    breathRateMul: 0.85, // slower sighing breathing
    breathDepthMul: 1.1, // deeper prolonged exhalation
    torsoSwayMul: 0.6,   // gentler, slower sway
  },
  angry: {
    headPitch: -0.012,  // level, slightly held back (~ -0.69°)
    headRoll: 0,
    headYaw: 0,
    spinePitch: -0.016, // straightened, restrained tension (~ -0.92°)
    spineRoll: 0,
    spineYaw: 0,
    chestPitch: -0.01,
    gazeOffsetX: 0,     // direct, steady focus
    gazeOffsetY: 0,
    breathRateMul: 1.15,
    breathDepthMul: 0.82, // tight, slightly shallow breathing
    torsoSwayMul: 0.45,   // restrained, stiffened posture
  },
};

/**
 * CantarellaIdleController
 *
 * Drives natural, organic procedural idle behaviors for Cantarella while Stella is not speaking,
 * with emotion-aware body language response:
 * 1. Gentle asymmetric breathing with organic rate & depth variation
 * 2. Biologically plausible blinking (randomized intervals, variable durations, occasional double-blinks)
 * 3. Multi-frequency Lissajous head micro-drift (calm, sub-degree baseline)
 * 4. Micro-saccadic eye gaze adjustments towards the camera/user
 * 5. Subtle low-frequency torso sway (spine & chest yaw/roll)
 * 6. Emotion-Aware Body Language:
 *    - Seamlessly reflects active conversation emotions (happy, playful, shy, curious, sad, angry)
 *    - Nuanced postural offsets on spine, chest, neck, and head
 *    - Dynamic modulation of breathing rate/depth and torso sway
 *    - Coordinated emotional gaze direction (e.g. bashful sideways deflection for shy, direct lock for curious)
 *    - Conversation emotion takes priority over random autonomous gestures
 *    - Fallback handling for unsupported mesh expressions without snapping
 * 7. Autonomous episodic behaviors scheduled on natural cooldowns:
 *    - Gentle head turns and returning smoothly to forward rest
 *    - Small celestial head tilts of curiosity
 *    - Gentle upper-body posture shifts / weight settles
 *    - Thoughtful deep breaths / sighs
 *    - Gentle occasional nodding & graceful waving
 * 8. Non-destructive rig safety: smooth Hermite transitions, bounded values, spring-bone friendliness,
 *    and clean blending with imported VRMA motions.
 */
export class CantarellaIdleController {
  private vrm: VRM;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private config: Required<IdleControllerConfig>;

  // ── Baseline Breathing ──────────────────────────────────────────────────────
  private breathTime: number = 0;
  private breathVariationTime: number = 0;
  private readonly baseBreathPeriod: number = 3.8; // ~15.8 breaths per minute baseline
  private deepBreathMultiplier: number = 1.0;

  // ── Blinking State Machine ──────────────────────────────────────────────────
  private blinkState: BlinkState = 'WAITING';
  private blinkTimer: number = 0;
  private timeUntilNextBlink: number = 3.2;
  private readonly closingDuration: number = 0.065; // ~65ms fast eyelid close
  private readonly openingDuration: number = 0.115; // ~115ms smooth reopen
  private readonly doublePauseDuration: number = 0.12; // 120ms between double-blinks
  private isDoubleBlink: boolean = false;
  private hasCompletedFirstOfDouble: boolean = false;
  private currentBlinkWeight: number = 0;

  // ── Eye Gaze & Micro-Saccades ───────────────────────────────────────────────
  private gazeTarget: THREE.Object3D;
  private currentGazeOffset: THREE.Vector3 = new THREE.Vector3();
  private targetGazeOffset: THREE.Vector3 = new THREE.Vector3();
  private saccadeTimer: number = 0;
  private timeUntilNextSaccade: number = 3.5;
  private autonomousGazeOffset: THREE.Vector3 = new THREE.Vector3();
  private emotionGazeOffset: THREE.Vector3 = new THREE.Vector3();

  // ── Subtle Torso Sway ───────────────────────────────────────────────────────
  private torsoSwayTime: number = 0;

  // ── Calibrated Rest Arm Poses (VRM Humanoid Normalized) ────────────────────
  private readonly REST_RIGHT_UPPER = new THREE.Euler(0.08, -0.04, -1.25);
  private readonly REST_RIGHT_LOWER = new THREE.Euler(0, -0.12, -0.1);
  private readonly REST_LEFT_UPPER = new THREE.Euler(0.08, 0.04, 1.25);
  private readonly REST_LEFT_LOWER = new THREE.Euler(0, 0.12, 0.1);

  // ── Explicit / Manual Gesture State (via Expression Controller) ─────────────
  private activeGesture: CantarellaGestureName | null = null;
  private gestureTimer: number = 0;

  // ── Autonomous Idle Scheduling & Execution ─────────────────────────────────
  private autonomousTimer: number = 0;
  private timeUntilNextAutonomousAction: number = 0;
  private currentAutonomousAction: ActiveAutonomousBehavior | null = null;
  private lastActionType: AutonomousIdleBehaviorType | null = null;

  // ── Emotion-Aware Body Language State ──────────────────────────────────────
  private expressionController: CantarellaExpressionController | null = null;
  private activeEmotion: CantarellaExpressionName = 'neutral';
  private targetEmotionWeight: number = 0;

  // Smoothed emotional offsets for seamless delta-time blending without snapping
  private smoothedEmotionHeadPitch: number = 0;
  private smoothedEmotionHeadRoll: number = 0;
  private smoothedEmotionHeadYaw: number = 0;
  private smoothedEmotionSpinePitch: number = 0;
  private smoothedEmotionSpineRoll: number = 0;
  private smoothedEmotionSpineYaw: number = 0;
  private smoothedEmotionChestPitch: number = 0;
  private smoothedEmotionGazeX: number = 0;
  private smoothedEmotionGazeY: number = 0;
  private smoothedBreathRateMul: number = 1.0;
  private smoothedBreathDepthMul: number = 1.0;
  private smoothedTorsoSwayMul: number = 1.0;

  // ── Conversation-Aware State ──────────────────────────────────────────────
  private conversationState: CantarellaConversationState = 'idle';
  private smoothedConvHeadPitch: number = 0;
  private smoothedConvHeadRoll: number = 0;
  private smoothedConvHeadYaw: number = 0;
  private smoothedConvSpinePitch: number = 0;
  private smoothedConvChestPitch: number = 0;
  private smoothedConvGazeX: number = 0;
  private smoothedConvGazeY: number = 0;
  private convSpeakingCadenceTime: number = 0;
  private conversationGazeOffset: THREE.Vector3 = new THREE.Vector3();

  // ── Random Asset Action State ──────────────────────────────────────────────
  private animationManager: CantarellaAnimationManager | null = null;
  private randomAssetTimer: number = 0;
  private timeUntilNextAssetAction: number = 45.0;
  private lastAssetMotionId: string | null = null;
  private assetActionLastPlayed: Map<string, number> = new Map();

  // ── Idle Weight Blending (Fades out when imported VRMA motion plays) ────────
  private idleWeight: number = 1.0;

  constructor(
    vrm: VRM,
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    config: IdleControllerConfig = {}
  ) {
    this.vrm = vrm;
    this.camera = camera;
    this.scene = scene;

    this.config = {
      framing: config.framing ?? 'full',
      enableBreathing: config.enableBreathing ?? true,
      enableBlinking: config.enableBlinking ?? true,
      enableHeadMovement: config.enableHeadMovement ?? true,
      enableEyeGaze: config.enableEyeGaze ?? true,
      enableTorsoSway: config.enableTorsoSway ?? true,
      enableAutonomousIdle: config.enableAutonomousIdle ?? true,
      enableEmotionBodyLanguage: config.enableEmotionBodyLanguage ?? true,
      enableConversationAnimation: config.enableConversationAnimation ?? true,
      enableRandomAssetActions: config.enableRandomAssetActions ?? true,
    };

    // Virtual gaze target object placed in Three.js world space
    this.gazeTarget = new THREE.Object3D();
    this.gazeTarget.name = 'CantarellaGazeTarget';
    this.scene.add(this.gazeTarget);
    this.gazeTarget.position.copy(this.camera.position);

    // Attach gaze target to VRM lookAt if lookAt exists
    if (this.vrm.lookAt && this.config.enableEyeGaze) {
      this.vrm.lookAt.target = this.gazeTarget;
      this.vrm.lookAt.autoUpdate = true;
    }

    // Seed randomized intervals
    this.scheduleNextBlink();
    this.scheduleNextSaccade();
    // Shorter initial delay (5-9s) so Cantarella demonstrates lifelike presence soon after load
    this.scheduleNextAutonomousAction(true);
    // Initial random asset action delay (relaxed, non-intrusive)
    this.scheduleNextAssetAction(true);
  }

  /**
   * Connect an animation manager (AnimationMixer) for triggering VRMA motion assets.
   */
  public setAnimationManager(mgr: CantarellaAnimationManager | null): void {
    this.animationManager = mgr;
  }

  public getAnimationManager(): CantarellaAnimationManager | null {
    return this.animationManager;
  }

  /**
   * Explicitly set the avatar conversation state (idle, listening, thinking, speaking).
   */
  public setConversationState(state: CantarellaConversationState): void {
    this.conversationState = state;
    if (this.expressionController) {
      this.expressionController.setConversationState(state);
    }
  }

  public getConversationState(): CantarellaConversationState {
    return this.conversationState;
  }

  public getSmoothedConversationOffsets() {
    return {
      headPitch: this.smoothedConvHeadPitch,
      headRoll: this.smoothedConvHeadRoll,
      headYaw: this.smoothedConvHeadYaw,
      spinePitch: this.smoothedConvSpinePitch,
      chestPitch: this.smoothedConvChestPitch,
      gazeX: this.smoothedConvGazeX,
      gazeY: this.smoothedConvGazeY,
    };
  }

  public getLastAssetMotionId(): string | null {
    return this.lastAssetMotionId;
  }

  /**
   * Connect an expression controller to observe active emotional states.
   */
  public setExpressionController(ctrl: CantarellaExpressionController | null): void {
    this.expressionController = ctrl;
  }

  /**
   * Directly set active emotion and target intensity (for manual testing, preview, or override).
   */
  public setEmotion(emotion: CantarellaExpressionName, weight: number = 1.0): void {
    this.activeEmotion = emotion;
    this.targetEmotionWeight = Math.max(0, Math.min(1, weight));
  }

  public getActiveEmotion(): CantarellaExpressionName {
    return this.activeEmotion;
  }

  public getEmotionWeight(): number {
    return this.targetEmotionWeight;
  }

  public getSmoothedEmotionOffsets() {
    return {
      headPitch: this.smoothedEmotionHeadPitch,
      headRoll: this.smoothedEmotionHeadRoll,
      headYaw: this.smoothedEmotionHeadYaw,
      spinePitch: this.smoothedEmotionSpinePitch,
      spineRoll: this.smoothedEmotionSpineRoll,
      spineYaw: this.smoothedEmotionSpineYaw,
      chestPitch: this.smoothedEmotionChestPitch,
      gazeX: this.smoothedEmotionGazeX,
      gazeY: this.smoothedEmotionGazeY,
      breathRateMul: this.smoothedBreathRateMul,
      breathDepthMul: this.smoothedBreathDepthMul,
      torsoSwayMul: this.smoothedTorsoSwayMul,
    };
  }

  /**
   * Update all idle animation elements for this frame.
   * Call once per frame inside the primary requestAnimationFrame loop before vrm.update(delta).
   *
   * @param delta Frame time delta in seconds (capped to safe limit)
   * @param elapsedTime Total elapsed time in seconds
   * @param isMotionActive If true, an imported gesture/motion is active; suppresses conflicting bone updates
   */
  public update(delta: number, elapsedTime: number, isMotionActive: boolean = false): void {
    const dt = Math.min(delta, 0.05);

    // 1. Blend idle weight smoothly in/out when imported VRMA motions start or stop
    if (isMotionActive) {
      this.idleWeight = Math.max(0, this.idleWeight - dt * 3.0);
      // Cancel any active gestures or autonomous actions immediately
      if (this.activeGesture) {
        this.activeGesture = null;
        this.gestureTimer = 0;
      }
      if (this.currentAutonomousAction) {
        this.currentAutonomousAction = null;
      }
      // Reset autonomous cooldown so action doesn't fire the instant speech ends
      this.autonomousTimer = 0;
      this.scheduleNextAutonomousAction(false);
      this.randomAssetTimer = 0;
      this.scheduleNextAssetAction(false);
    } else {
      this.idleWeight = Math.min(1.0, this.idleWeight + dt * 2.0);
    }

    const w = this.idleWeight;

    // 2. Synchronize active emotion & conversation state from attached ExpressionController if present
    if (this.expressionController) {
      const status = this.expressionController.getStatus();
      this.activeEmotion = status.targetExpression;
      this.targetEmotionWeight = status.activeWeight;
      if (status.conversationState) {
        this.conversationState = status.conversationState;
      }
    }

    // 3. Smoothly blend emotional postural offsets over delta-time
    if (this.config.enableEmotionBodyLanguage) {
      const targetProfile =
        EMOTION_POSTURE_PROFILES[this.activeEmotion] ?? EMOTION_POSTURE_PROFILES.neutral;
      const effectiveWeight = this.activeEmotion === 'neutral' ? 0 : this.targetEmotionWeight;

      // Responsive yet smooth exponential damping (~200ms ease)
      const emoAlpha = Math.min(1.0, dt * 5.0);

      this.smoothedEmotionHeadPitch +=
        (targetProfile.headPitch * effectiveWeight - this.smoothedEmotionHeadPitch) * emoAlpha;
      this.smoothedEmotionHeadRoll +=
        (targetProfile.headRoll * effectiveWeight - this.smoothedEmotionHeadRoll) * emoAlpha;
      this.smoothedEmotionHeadYaw +=
        (targetProfile.headYaw * effectiveWeight - this.smoothedEmotionHeadYaw) * emoAlpha;

      this.smoothedEmotionSpinePitch +=
        (targetProfile.spinePitch * effectiveWeight - this.smoothedEmotionSpinePitch) * emoAlpha;
      this.smoothedEmotionSpineRoll +=
        (targetProfile.spineRoll * effectiveWeight - this.smoothedEmotionSpineRoll) * emoAlpha;
      this.smoothedEmotionSpineYaw +=
        (targetProfile.spineYaw * effectiveWeight - this.smoothedEmotionSpineYaw) * emoAlpha;

      this.smoothedEmotionChestPitch +=
        (targetProfile.chestPitch * effectiveWeight - this.smoothedEmotionChestPitch) * emoAlpha;
      this.smoothedEmotionGazeX +=
        (targetProfile.gazeOffsetX * effectiveWeight - this.smoothedEmotionGazeX) * emoAlpha;
      this.smoothedEmotionGazeY +=
        (targetProfile.gazeOffsetY * effectiveWeight - this.smoothedEmotionGazeY) * emoAlpha;

      const targetBreathRate = 1.0 + (targetProfile.breathRateMul - 1.0) * effectiveWeight;
      const targetBreathDepth = 1.0 + (targetProfile.breathDepthMul - 1.0) * effectiveWeight;
      const targetTorsoSway = 1.0 + (targetProfile.torsoSwayMul - 1.0) * effectiveWeight;

      this.smoothedBreathRateMul += (targetBreathRate - this.smoothedBreathRateMul) * emoAlpha;
      this.smoothedBreathDepthMul += (targetBreathDepth - this.smoothedBreathDepthMul) * emoAlpha;
      this.smoothedTorsoSwayMul += (targetTorsoSway - this.smoothedTorsoSwayMul) * emoAlpha;

      this.emotionGazeOffset.set(this.smoothedEmotionGazeX, this.smoothedEmotionGazeY, 0);
    } else {
      this.emotionGazeOffset.set(0, 0, 0);
    }

    // 3b. Smoothly blend conversation state postures (listening, thinking, speaking)
    let convSwayAttenuation = 1.0;
    if (this.config.enableConversationAnimation) {
      let targetConvHeadPitch = 0;
      let targetConvHeadRoll = 0;
      let targetConvHeadYaw = 0;
      let targetConvSpinePitch = 0;
      let targetConvChestPitch = 0;
      let targetConvGazeX = 0;
      let targetConvGazeY = 0;

      switch (this.conversationState) {
        case 'listening': {
          // Attentive listening posture: slight forward pitch, direct eye contact, calmed sway
          targetConvSpinePitch = 0.016; // subtle attentive lean toward user (~0.9°)
          targetConvChestPitch = 0.010;
          targetConvHeadPitch = 0.005;
          targetConvGazeX = 0;
          targetConvGazeY = 0;
          convSwayAttenuation = 0.6;
          break;
        }

        case 'thinking': {
          // Thoughtful cognitive posture: slight head tilt & lift, gaze deflected upward/aside
          targetConvHeadPitch = -0.018; // slight contemplative lift
          targetConvHeadRoll = 0.035;  // thoughtful tilt (~2°)
          targetConvHeadYaw = 0.020;
          targetConvSpinePitch = 0.005;
          targetConvChestPitch = 0.003;
          targetConvGazeX = 0.12;       // looking slightly aside while thinking
          targetConvGazeY = 0.06;       // looking slightly upward
          convSwayAttenuation = 0.7;
          break;
        }

        case 'speaking': {
          // Conversational speaking posture with rhythmic head accents/nod cadence
          this.convSpeakingCadenceTime += dt;
          // Harmonic wave matching speech cadence ~2.2 Hz
          const cadencePitch =
            Math.sin(this.convSpeakingCadenceTime * 4.4) * 0.016 +
            Math.cos(this.convSpeakingCadenceTime * 2.2) * 0.008;
          const cadenceYaw = Math.sin(this.convSpeakingCadenceTime * 1.8) * 0.010;

          targetConvHeadPitch = cadencePitch;
          targetConvHeadYaw = cadenceYaw;
          targetConvHeadRoll = 0.004;
          targetConvSpinePitch = -0.008; // lifted expressive posture
          targetConvChestPitch = -0.006;
          targetConvGazeX = 0;
          targetConvGazeY = 0.01;
          convSwayAttenuation = 0.85;
          break;
        }

        case 'idle':
        default:
          this.convSpeakingCadenceTime = 0;
          break;
      }

      const convAlpha = Math.min(1.0, dt * (this.conversationState === 'speaking' ? 8.0 : 4.0));
      this.smoothedConvHeadPitch += (targetConvHeadPitch - this.smoothedConvHeadPitch) * convAlpha;
      this.smoothedConvHeadRoll += (targetConvHeadRoll - this.smoothedConvHeadRoll) * convAlpha;
      this.smoothedConvHeadYaw += (targetConvHeadYaw - this.smoothedConvHeadYaw) * convAlpha;
      this.smoothedConvSpinePitch += (targetConvSpinePitch - this.smoothedConvSpinePitch) * convAlpha;
      this.smoothedConvChestPitch += (targetConvChestPitch - this.smoothedConvChestPitch) * convAlpha;
      this.smoothedConvGazeX += (targetConvGazeX - this.smoothedConvGazeX) * convAlpha;
      this.smoothedConvGazeY += (targetConvGazeY - this.smoothedConvGazeY) * convAlpha;

      this.conversationGazeOffset.set(this.smoothedConvGazeX, this.smoothedConvGazeY, 0);
    } else {
      this.conversationGazeOffset.set(0, 0, 0);
    }

    // 4. Update autonomous episodic action scheduler if in baseline idle
    if (
      this.config.enableAutonomousIdle &&
      !isMotionActive &&
      !this.activeGesture &&
      this.conversationState === 'idle' &&
      w >= 0.95
    ) {
      this.updateAutonomousScheduler(dt);
    }

    // 4b. Update random asset action scheduler (selects from existing VRMA animation assets during quiet baseline moments)
    if (
      this.config.enableRandomAssetActions &&
      !isMotionActive &&
      !this.activeGesture &&
      !this.currentAutonomousAction &&
      this.conversationState === 'idle' &&
      w >= 0.95
    ) {
      this.updateRandomAssetScheduler(dt);
    }

    // 5. Compute autonomous action contribution weights (cubic Hermite easing)
    let autoHeadYaw = 0;
    let autoHeadPitch = 0;
    let autoHeadRoll = 0;
    let autoSpineYaw = 0;
    let autoSpinePitch = 0;
    let autoSpineRoll = 0;

    if (this.currentAutonomousAction && w > 0.001) {
      const act = this.currentAutonomousAction;
      act.timer += dt;

      let factor = 0;
      if (act.timer < act.inDuration) {
        // Ease-in: cubic Hermite smoothstep (0 -> 1)
        const p = act.timer / act.inDuration;
        factor = p * p * (3.0 - 2.0 * p);
      } else if (act.timer < act.inDuration + act.holdDuration) {
        // Hold phase: natural living pause with subtle micro-undulation
        const holdProgress = (act.timer - act.inDuration) / act.holdDuration;
        const microWobble = Math.sin(holdProgress * Math.PI * 2.0) * 0.04;
        factor = 1.0 + microWobble;
      } else if (act.timer < act.totalDuration) {
        // Ease-out: cubic Hermite return (1 -> 0)
        const outProgress = (act.timer - act.inDuration - act.holdDuration) / act.outDuration;
        const p = Math.max(0, Math.min(1, 1.0 - outProgress));
        factor = p * p * (3.0 - 2.0 * p);
      } else {
        // Completed action
        factor = 0;
        this.currentAutonomousAction = null;
        this.deepBreathMultiplier = 1.0;
        this.scheduleNextAutonomousAction(false);
      }

      autoHeadYaw = act.targetHeadYaw * factor;
      autoHeadPitch = act.targetHeadPitch * factor;
      autoHeadRoll = act.targetHeadRoll * factor;
      autoSpineYaw = act.targetSpineYaw * factor;
      autoSpinePitch = act.targetSpinePitch * factor;
      autoSpineRoll = act.targetSpineRoll * factor;

      // Coordinate gaze offset with head turn
      this.autonomousGazeOffset.set(
        act.targetGazeOffsetX * factor,
        act.targetGazeOffsetY * factor,
        0
      );

      // Deep breath specific multiplier
      if (act.type === 'DEEP_BREATH') {
        this.deepBreathMultiplier = 1.0 + 0.45 * factor;
      }
    } else {
      this.autonomousGazeOffset.set(0, 0, 0);
    }

    // 6. Update procedural breathing (pitch on spine and chest, modified by emotion & conversation)
    if (this.config.enableBreathing && w > 0.001) {
      this.updateBreathing(dt, w, autoSpinePitch);
    }

    // 7. Update subtle torso sway (yaw and roll on spine and chest, modified by emotion & conversation)
    if (this.config.enableTorsoSway && w > 0.001) {
      this.updateTorsoSway(dt, w, autoSpineYaw, autoSpineRoll, convSwayAttenuation);
    }

    // 8. Update head movement (multi-frequency Lissajous + autonomous turn/tilt + emotion posture + conversation cadence)
    if (this.config.enableHeadMovement && w > 0.001) {
      this.updateHeadMovement(elapsedTime, w, autoHeadYaw, autoHeadPitch, autoHeadRoll);
    }

    // 9. Update biological blinking (runs continuously, even during motions)
    if (this.config.enableBlinking) {
      this.updateBlinking(dt);
    }

    // 10. Update eye gaze direction (saccades + autonomous look offset + emotion gaze offset + conversation gaze offset)
    if (this.config.enableEyeGaze) {
      this.updateEyeGaze(dt);
    }

    // 11. Update active gesture (wave or nod), either manual or autonomous
    if (this.activeGesture && !isMotionActive) {
      this.updateGesture(dt);
    }
  }

  /**
   * Autonomous Behavior Scheduler:
   * Chooses natural, non-repetitive idle behaviors with weighted probabilities and cooldowns.
   * Priority rule: pauses during active conversation emotion to let emotional body language shine.
   */
  private updateAutonomousScheduler(dt: number): void {
    if (this.currentAutonomousAction) return;

    // Active conversation state (listening, thinking, speaking) takes priority over random idle actions
    if (this.conversationState !== 'idle') {
      return;
    }

    // Active conversation emotion takes priority over random idle actions
    if (this.activeEmotion !== 'neutral' && this.targetEmotionWeight > 0.1) {
      return;
    }

    this.autonomousTimer += dt;
    if (this.autonomousTimer < this.timeUntilNextAutonomousAction) return;

    this.autonomousTimer = 0;

    // Behavioral pool with randomized parameters
    const candidates: AutonomousIdleBehaviorType[] = [
      'LOOK_SIDE',
      'HEAD_TILT',
      'POSTURE_SHIFT',
      'DEEP_BREATH',
      'GENTLE_NOD',
    ];

    // Avoid repeating the exact same behavior consecutively
    let filtered = candidates.filter((c) => c !== this.lastActionType);
    if (filtered.length === 0) filtered = candidates;

    // Weighted selection
    const rand = Math.random();
    let chosen: AutonomousIdleBehaviorType;

    if (rand < 0.32) {
      chosen = 'LOOK_SIDE';
    } else if (rand < 0.56) {
      chosen = 'HEAD_TILT';
    } else if (rand < 0.74) {
      chosen = 'POSTURE_SHIFT';
    } else if (rand < 0.88) {
      chosen = 'DEEP_BREATH';
    } else {
      chosen = 'GENTLE_NOD';
    }

    this.lastActionType = chosen;

    if (chosen === 'GENTLE_NOD') {
      this.playGesture('nod', false);
      this.scheduleNextAutonomousAction(false);
      return;
    }

    // Build autonomous behavior parameter spec
    this.currentAutonomousAction = this.createAutonomousBehavior(chosen);
  }

  /**
   * Factory for parameterized autonomous behaviors.
   * Keeps rotations bounded to safe, subtle ranges (<= 8° yaw, <= 5° roll, <= 4° pitch).
   */
  private createAutonomousBehavior(type: AutonomousIdleBehaviorType): ActiveAutonomousBehavior {
    // Random side selection: left (-1) or right (+1)
    const side = Math.random() < 0.5 ? -1 : 1;

    switch (type) {
      case 'LOOK_SIDE': {
        // Gentle turn looking slightly into the celestial environment (~4.5° to 7.5° yaw)
        const yaw = side * (0.08 + Math.random() * 0.05);
        const pitch = (Math.random() - 0.5) * 0.03; // slight pitch adjustment
        const roll = -side * 0.015; // natural slight counter-roll
        const inDur = 1.3 + Math.random() * 0.5;
        const holdDur = 1.6 + Math.random() * 1.2;
        const outDur = 1.4 + Math.random() * 0.5;

        return {
          type,
          timer: 0,
          inDuration: inDur,
          holdDuration: holdDur,
          outDuration: outDur,
          totalDuration: inDur + holdDur + outDur,
          targetHeadYaw: yaw,
          targetHeadPitch: pitch,
          targetHeadRoll: roll,
          targetSpineYaw: yaw * 0.22, // subtle spine coordination (~1.2°)
          targetSpinePitch: 0,
          targetSpineRoll: 0,
          targetGazeOffsetX: side * (0.18 + Math.random() * 0.12), // Eyes lead look direction
          targetGazeOffsetY: pitch * 0.5,
        };
      }

      case 'HEAD_TILT': {
        // Celestial curiosity tilt (~3° to 5° roll)
        const roll = side * (0.055 + Math.random() * 0.035);
        const pitch = (Math.random() - 0.3) * 0.025; // slight upward tilt
        const inDur = 1.2 + Math.random() * 0.4;
        const holdDur = 1.8 + Math.random() * 1.0;
        const outDur = 1.3 + Math.random() * 0.4;

        return {
          type,
          timer: 0,
          inDuration: inDur,
          holdDuration: holdDur,
          outDuration: outDur,
          totalDuration: inDur + holdDur + outDur,
          targetHeadYaw: side * 0.02,
          targetHeadPitch: pitch,
          targetHeadRoll: roll,
          targetSpineYaw: 0,
          targetSpinePitch: 0,
          targetSpineRoll: roll * 0.15,
          targetGazeOffsetX: 0,
          targetGazeOffsetY: 0.02,
        };
      }

      case 'POSTURE_SHIFT': {
        // Natural subtle weight settle and relaxation (~1° spine shift)
        const spineYaw = side * (0.012 + Math.random() * 0.01);
        const spinePitch = (Math.random() - 0.5) * 0.012;
        const inDur = 1.5 + Math.random() * 0.5;
        const holdDur = 2.2 + Math.random() * 1.0;
        const outDur = 1.6 + Math.random() * 0.5;

        return {
          type,
          timer: 0,
          inDuration: inDur,
          holdDuration: holdDur,
          outDuration: outDur,
          totalDuration: inDur + holdDur + outDur,
          targetHeadYaw: -spineYaw * 0.5, // head compensates to keep focus near user
          targetHeadPitch: 0.015,
          targetHeadRoll: side * 0.015,
          targetSpineYaw: spineYaw,
          targetSpinePitch: spinePitch,
          targetSpineRoll: side * 0.008,
          targetGazeOffsetX: 0,
          targetGazeOffsetY: 0,
        };
      }

      case 'DEEP_BREATH': {
        // Thoughtful contemplative sigh / deep breath
        const inDur = 1.8;
        const holdDur = 0.8;
        const outDur = 2.2;

        return {
          type,
          timer: 0,
          inDuration: inDur,
          holdDuration: holdDur,
          outDuration: outDur,
          totalDuration: inDur + holdDur + outDur,
          targetHeadYaw: 0,
          targetHeadPitch: -0.038, // gentle upward lift during deep breath (~2.2°)
          targetHeadRoll: 0,
          targetSpineYaw: 0,
          targetSpinePitch: -0.012, // subtle chest opening
          targetSpineRoll: 0,
          targetGazeOffsetX: 0,
          targetGazeOffsetY: 0.04, // slight upward gaze
        };
      }

      default:
        return {
          type: 'LOOK_SIDE',
          timer: 0,
          inDuration: 1.2,
          holdDuration: 1.5,
          outDuration: 1.2,
          totalDuration: 3.9,
          targetHeadYaw: 0.08,
          targetHeadPitch: 0,
          targetHeadRoll: 0,
          targetSpineYaw: 0.01,
          targetSpinePitch: 0,
          targetSpineRoll: 0,
          targetGazeOffsetX: 0.1,
          targetGazeOffsetY: 0,
        };
    }
  }

  private scheduleNextAutonomousAction(isInitial: boolean): void {
    if (isInitial) {
      // First autonomous action occurs sooner (6s to 10s)
      this.timeUntilNextAutonomousAction = 6.0 + Math.random() * 4.0;
    } else {
      // Normal relaxed cooldown between behaviors: 12s to 24s
      // Keeps character relaxed most of the time without constant motion
      this.timeUntilNextAutonomousAction = 12.0 + Math.random() * 12.0;
    }
  }

  private scheduleNextAssetAction(isInitial: boolean = false): void {
    if (isInitial) {
      // Shorter initial delay so users can see autonomous action within initial minute
      this.timeUntilNextAssetAction = 40.0 + Math.random() * 20.0;
    } else {
      // Normal relaxed cooldown between full-body asset actions (35s to 65s)
      this.timeUntilNextAssetAction = 35.0 + Math.random() * 30.0;
    }
  }

  /**
   * Random Asset Action Scheduler:
   * Selects suitable animations from existing project VRMA files during quiet baseline moments.
   * Enforces priority hierarchy, cooldowns, weighting, anti-repetition, and emotional safety.
   */
  private updateRandomAssetScheduler(dt: number): void {
    if (!this.animationManager || this.animationManager.isPlaying() || this.animationManager.isLoading()) {
      return;
    }

    // Do not schedule random asset actions if emotional state is sensitive/serious (sad, angry)
    if (this.activeEmotion === 'sad' || this.activeEmotion === 'angry') {
      return;
    }

    this.randomAssetTimer += dt;
    if (this.randomAssetTimer < this.timeUntilNextAssetAction) {
      return;
    }

    // Cooldown elapsed, attempt to choose an eligible random asset action
    this.randomAssetTimer = 0;
    this.scheduleNextAssetAction(false);

    // Filter candidate actions based on eligibility rules
    const now = performance.now() / 1000;
    const eligible = RANDOM_ASSET_ACTIONS.filter((act) => {
      // 1. Anti-repetition: do not repeat the exact same asset motion consecutively
      if (act.motionId === this.lastAssetMotionId) {
        return false;
      }
      // 2. Emotion safety: emotion must be in allowed list for this action
      if (!act.allowedEmotions.includes(this.activeEmotion)) {
        return false;
      }
      // 3. Framing compatibility: if framing is specified, must match current framing
      if (act.allowedFramings && !act.allowedFramings.includes(this.config.framing)) {
        return false;
      }
      // 4. Action-specific minimum cooldown
      const lastPlayed = this.assetActionLastPlayed.get(act.motionId) ?? 0;
      if (now - lastPlayed < act.minCooldown) {
        return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      return;
    }

    // Weighted random selection among eligible actions
    const totalWeight = eligible.reduce((acc, curr) => acc + curr.weight, 0);
    let r = Math.random() * totalWeight;
    let selected = eligible[0];
    for (const act of eligible) {
      r -= act.weight;
      if (r <= 0) {
        selected = act;
        break;
      }
    }

    // Trigger selected action
    this.executeAssetAction(selected.motionId);
  }

  /**
   * Execute an asset-based action using CantarellaAnimationManager.
   */
  private executeAssetAction(motionId: string): boolean {
    if (!this.animationManager) return false;

    const now = performance.now() / 1000;
    this.lastAssetMotionId = motionId;
    this.assetActionLastPlayed.set(motionId, now);

    // Reset episodic autonomous timer so episodic gestures don't pop immediately after
    this.autonomousTimer = 0;
    this.scheduleNextAutonomousAction(false);

    // Play via shared CantarellaAnimationManager
    this.animationManager.playMotion(motionId).catch((err) => {
      console.warn(`[Cantarella Idle] Failed to execute random asset action ${motionId}:`, err);
    });

    return true;
  }

  /**
   * Programmatically trigger an eligible random asset action, or force a specific one.
   * Useful for testing, diagnostics, or direct scripting.
   */
  public triggerRandomAssetAction(forceMotionId?: string): boolean {
    if (!this.animationManager || this.animationManager.isPlaying()) {
      return false;
    }

    if (forceMotionId) {
      return this.executeAssetAction(forceMotionId);
    }

    // If no specific motionId is passed, run eligible selection
    const now = performance.now() / 1000;
    const eligible = RANDOM_ASSET_ACTIONS.filter((act) => {
      if (act.motionId === this.lastAssetMotionId) return false;
      if (!act.allowedEmotions.includes(this.activeEmotion)) return false;
      if (act.allowedFramings && !act.allowedFramings.includes(this.config.framing)) return false;
      const lastPlayed = this.assetActionLastPlayed.get(act.motionId) ?? 0;
      if (now - lastPlayed < act.minCooldown) return false;
      return true;
    });

    if (eligible.length === 0) return false;

    const totalWeight = eligible.reduce((acc, curr) => acc + curr.weight, 0);
    let r = Math.random() * totalWeight;
    let selected = eligible[0];
    for (const act of eligible) {
      r -= act.weight;
      if (r <= 0) {
        selected = act;
        break;
      }
    }

    return this.executeAssetAction(selected.motionId);
  }

  /**
   * Gentle, asymmetric breathing with organic rate & depth variation:
   * Slowly modulates cycle period (~3.4s - 4.2s) and depth (0.85x - 1.15x),
   * seamlessly blended with emotional breathing rate & depth multipliers.
   * Drives pitch (rotation.x) on spine and chest.
   */
  private updateBreathing(delta: number, weight: number, autoSpinePitch: number): void {
    this.breathVariationTime += delta;

    // Slow period modulation modulated by emotional rate multiplier
    const periodMod =
      (1.0 + 0.1 * Math.sin(this.breathVariationTime * 0.26)) /
      Math.max(0.5, this.smoothedBreathRateMul);
    const activePeriod = this.baseBreathPeriod * periodMod;

    // Slow depth modulation modulated by emotional depth multiplier
    const depthMod =
      (1.0 + 0.15 * Math.sin(this.breathVariationTime * 0.19 + 1.2)) *
      this.deepBreathMultiplier *
      this.smoothedBreathDepthMul;

    this.breathTime += delta;
    const cycle = (this.breathTime % activePeriod) / activePeriod;

    // Asymmetric breathing curve: inhalation builds smoothly, exhalation is gentle and prolonged
    const breathFactor =
      (0.65 * Math.sin(cycle * Math.PI * 2) +
        0.25 * Math.sin(cycle * Math.PI * 4 - Math.PI * 0.3)) *
      depthMod;

    // Subtle spine pitch combined with autonomous, emotional, and conversational posture
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) {
      const rawSpinePitch =
        breathFactor * 0.013 +
        autoSpinePitch +
        this.smoothedEmotionSpinePitch +
        this.smoothedConvSpinePitch;
      spine.rotation.x = Math.max(-0.06, Math.min(0.06, rawSpinePitch)) * weight;
    }

    // Subtle chest pitch combined with autonomous, emotional, and conversational posture
    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) {
      const rawChestPitch =
        breathFactor * 0.007 +
        autoSpinePitch * 0.6 +
        this.smoothedEmotionChestPitch +
        this.smoothedConvChestPitch;
      chest.rotation.x = Math.max(-0.04, Math.min(0.04, rawChestPitch)) * weight;
    }
  }

  /**
   * Subtle upper-body torso sway:
   * Multi-frequency slow oscillation on yaw (Y) and roll (Z), layered alongside breathing (X),
   * modulated by emotional posture offsets and sway multipliers, dampened during attentive listening.
   */
  private updateTorsoSway(
    delta: number,
    weight: number,
    autoSpineYaw: number,
    autoSpineRoll: number,
    convSwayAttenuation: number = 1.0
  ): void {
    this.torsoSwayTime += delta;

    // Postural sway scaled by emotional sway multiplier and conversation attenuation
    const swayYaw =
      (Math.sin(this.torsoSwayTime * 0.22) * 0.005 +
        Math.cos(this.torsoSwayTime * 0.11) * 0.003) *
      this.smoothedTorsoSwayMul *
      convSwayAttenuation;

    const swayRoll =
      Math.sin(this.torsoSwayTime * 0.16) *
      0.0035 *
      this.smoothedTorsoSwayMul *
      convSwayAttenuation;

    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) {
      const rawSpineYaw = swayYaw + autoSpineYaw + this.smoothedEmotionSpineYaw;
      const rawSpineRoll = swayRoll + autoSpineRoll + this.smoothedEmotionSpineRoll;
      spine.rotation.y = Math.max(-0.05, Math.min(0.05, rawSpineYaw)) * weight;
      spine.rotation.z = Math.max(-0.04, Math.min(0.04, rawSpineRoll)) * weight;
    }

    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) {
      // Chest follows spine sway with slight natural attenuation
      const rawChestYaw = swayYaw * 0.6 + autoSpineYaw * 0.6 + this.smoothedEmotionSpineYaw * 0.6;
      const rawChestRoll =
        swayRoll * 0.5 + autoSpineRoll * 0.5 + this.smoothedEmotionSpineRoll * 0.5;
      chest.rotation.y = Math.max(-0.04, Math.min(0.04, rawChestYaw)) * weight;
      chest.rotation.z = Math.max(-0.03, Math.min(0.03, rawChestRoll)) * weight;
    }
  }

  /**
   * Multi-frequency Lissajous head micro-drift combined with autonomous head turns and tilts,
   * plus smooth emotion-aware head posture and conversation cadence oscillations.
   * Motion is restrained to natural bounds and smoothed.
   */
  private updateHeadMovement(
    time: number,
    weight: number,
    autoHeadYaw: number,
    autoHeadPitch: number,
    autoHeadRoll: number
  ): void {
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (!head) return;

    // Baseline microscopic head drift (multi-frequency Lissajous, sub-degree)
    const microPitch = Math.sin(time * 0.32) * 0.008 + Math.sin(time * 0.71) * 0.003;
    const microYaw = Math.sin(time * 0.21) * 0.012 + Math.cos(time * 0.44) * 0.005;
    const microRoll = Math.sin(time * 0.17) * 0.005;

    // Combined rotation clamped to safe biological bounds
    const rawPitch =
      microPitch + autoHeadPitch + this.smoothedEmotionHeadPitch + this.smoothedConvHeadPitch;
    const rawYaw =
      microYaw + autoHeadYaw + this.smoothedEmotionHeadYaw + this.smoothedConvHeadYaw;
    const rawRoll =
      microRoll + autoHeadRoll + this.smoothedEmotionHeadRoll + this.smoothedConvHeadRoll;

    const totalPitch = Math.max(-0.15, Math.min(0.15, rawPitch)) * weight;
    const totalYaw = Math.max(-0.25, Math.min(0.25, rawYaw)) * weight;
    const totalRoll = Math.max(-0.16, Math.min(0.16, rawRoll)) * weight;

    // If neck bone exists, distribute 22% of yaw/pitch/roll to neck for extra realism
    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
    if (neck) {
      neck.rotation.set(totalPitch * 0.22, totalYaw * 0.22, totalRoll * 0.2);
      head.rotation.set(totalPitch * 0.78, totalYaw * 0.78, totalRoll * 0.8);
    } else {
      head.rotation.set(totalPitch, totalYaw, totalRoll);
    }
  }

  /**
   * Biologically plausible blinking state machine:
   * - Natural randomized intervals between 2.4s and 5.5s
   * - Fast eyelid close (~65ms) and smooth ease-out open (~115ms)
   * - 18% chance of a double-blink sequence
   */
  private updateBlinking(delta: number): void {
    if (!this.vrm.expressionManager) return;

    switch (this.blinkState) {
      case 'WAITING':
        this.blinkTimer += delta;
        if (this.blinkTimer >= this.timeUntilNextBlink) {
          this.blinkState = 'CLOSING';
          this.blinkTimer = 0;
          this.isDoubleBlink = Math.random() < 0.18;
          this.hasCompletedFirstOfDouble = false;
        }
        this.currentBlinkWeight = 0;
        break;

      case 'CLOSING': {
        this.blinkTimer += delta;
        const closeProgress = Math.min(1.0, this.blinkTimer / this.closingDuration);
        // Ease in closing (eyelids accelerate as they close)
        this.currentBlinkWeight = closeProgress * closeProgress;

        if (closeProgress >= 1.0) {
          this.blinkState = 'OPENING';
          this.blinkTimer = 0;
        }
        break;
      }

      case 'OPENING': {
        this.blinkTimer += delta;
        const openProgress = Math.min(1.0, this.blinkTimer / this.openingDuration);
        // Ease out opening (smooth reopening)
        this.currentBlinkWeight = 1.0 - (1.0 - Math.pow(1.0 - openProgress, 2));

        if (openProgress >= 1.0) {
          if (this.isDoubleBlink && !this.hasCompletedFirstOfDouble) {
            this.blinkState = 'DOUBLE_PAUSE';
            this.hasCompletedFirstOfDouble = true;
            this.blinkTimer = 0;
          } else {
            this.blinkState = 'WAITING';
            this.blinkTimer = 0;
            this.scheduleNextBlink();
          }
          this.currentBlinkWeight = 0;
        }
        break;
      }

      case 'DOUBLE_PAUSE':
        this.blinkTimer += delta;
        this.currentBlinkWeight = 0;
        if (this.blinkTimer >= this.doublePauseDuration) {
          this.blinkState = 'CLOSING';
          this.blinkTimer = 0;
        }
        break;
    }

    this.vrm.expressionManager.setValue('blink', this.currentBlinkWeight);
  }

  private scheduleNextBlink(): void {
    // Randomized interval between 2.4s and 5.4s (human average in conversational/observational state)
    this.timeUntilNextBlink = 2.4 + Math.random() * 3.0;
  }

  /**
   * Gentle micro-saccadic eye gaze movement coordinated with autonomous look directions,
   * emotion-specific gaze deflection (e.g. bashful sideways deflection for shy),
   * and conversation state gaze targeting (attentive forward focus during listening, thoughtful deflection during thinking):
   * Smoothly tracks camera position, adding natural microscopic fixation shifts and head turn coordination.
   */
  private updateEyeGaze(delta: number): void {
    this.saccadeTimer += delta;

    if (this.saccadeTimer >= this.timeUntilNextSaccade) {
      this.saccadeTimer = 0;
      this.scheduleNextSaccade();

      // In attentive/curious emotion or listening conversation state, reset to center (direct engaging eye contact)
      if (this.activeEmotion === 'curious' || this.conversationState === 'listening' || Math.random() < 0.4) {
        this.targetGazeOffset.set(0, 0, 0);
      } else {
        // Micro-saccade offset: max ±0.035m horizontally, ±0.022m vertically at ~3m distance
        const ox = (Math.random() - 0.5) * 0.07;
        const oy = (Math.random() - 0.5) * 0.045;
        this.targetGazeOffset.set(ox, oy, 0);
      }
    }

    // Smoothly damp current micro-saccade gaze offset towards target offset
    const lerpFactor = Math.min(1.0, delta * 10.0);
    this.currentGazeOffset.lerp(this.targetGazeOffset, lerpFactor);

    // Combine camera position + micro-saccades + autonomous look offset + emotion gaze offset + conversation gaze offset
    this.gazeTarget.position
      .copy(this.camera.position)
      .add(this.currentGazeOffset)
      .add(this.autonomousGazeOffset)
      .add(this.emotionGazeOffset)
      .add(this.conversationGazeOffset);
  }

  private scheduleNextSaccade(): void {
    // Saccadic fixation intervals between 2.8s and 5.2s
    this.timeUntilNextSaccade = 2.8 + Math.random() * 2.4;
  }

  /**
   * Safe, non-destructive gesture animations (wave, nod)
   * coexisting with spring-bone physics and smoothly returning to rest pose.
   */
  private updateGesture(delta: number): void {
    if (!this.activeGesture) return;

    if (this.activeGesture === 'nod') {
      this.gestureTimer += delta;
      const duration = 1.1; // Restrained, dignified nod ~1.1s
      const progress = Math.min(1.0, this.gestureTimer / duration);

      // Hann window (raised cosine): 0 -> 1 -> 0 with zero velocity at both ends
      const nodFactor = 0.5 * (1.0 - Math.cos(progress * Math.PI * 2.0));

      const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
      if (head) {
        // Stabilize yaw and roll during nod to prevent sideways wobble
        const stabilization = 1.0 - nodFactor * 0.85;
        head.rotation.y *= stabilization;
        head.rotation.z *= stabilization;
        // Clean restrained downward head tilt (~0.11 rad / ~6.3 degrees)
        head.rotation.x += nodFactor * 0.11;
      }

      const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
      if (spine) {
        // Subtle upper-spine courtesy bow (~0.022 rad / ~1.25 degrees)
        spine.rotation.x += nodFactor * 0.022;
      }

      if (progress >= 1.0) {
        this.activeGesture = null;
        this.gestureTimer = 0;
      }
    } else if (this.activeGesture === 'wave') {
      this.gestureTimer += delta;
      const duration = 2.0; // Friendly, natural wave ~2.0s
      const progress = Math.min(1.0, this.gestureTimer / duration);
      const waveFactor = 0.5 * (1.0 - Math.cos(progress * Math.PI * 2.0));

      const rightUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
      const rightLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
      const rightHand = this.vrm.humanoid?.getNormalizedBoneNode('rightHand');

      if (rightUpperArm && rightLowerArm) {
        // Lift right arm smoothly from resting A-pose
        rightUpperArm.rotation.x = this.REST_RIGHT_UPPER.x * (1 - waveFactor) + 0.35 * waveFactor;
        rightUpperArm.rotation.y = this.REST_RIGHT_UPPER.y * (1 - waveFactor) + (-0.15) * waveFactor;
        rightUpperArm.rotation.z = this.REST_RIGHT_UPPER.z * (1 - waveFactor) + (-2.05) * waveFactor;

        rightLowerArm.rotation.x = this.REST_RIGHT_LOWER.x * (1 - waveFactor) + 0.95 * waveFactor;
        rightLowerArm.rotation.y = this.REST_RIGHT_LOWER.y * (1 - waveFactor) + 0.45 * waveFactor;

        if (rightHand) {
          // Playful side-to-side wave oscillation
          const handSway = Math.sin(this.gestureTimer * 10.0) * 0.28 * waveFactor;
          rightHand.rotation.z = handSway;
        }
      }

      if (progress >= 1.0) {
        this.cancelGesture();
      }
    } else {
      this.cancelGesture();
    }
  }

  /**
   * Request a gesture (wave or nod) from an external controller or autonomous scheduler.
   */
  public playGesture(gesture: CantarellaGestureName, _isMotionActive: boolean = false): boolean {
    if (gesture !== 'nod' && gesture !== 'wave') {
      return false;
    }
    if (this.activeGesture) {
      this.cancelGesture();
    }
    this.activeGesture = gesture;
    this.gestureTimer = 0;
    return true;
  }

  /**
   * Cancel any running gesture and immediately restore arm rest pose.
   */
  public cancelGesture(): void {
    if (this.activeGesture) {
      this.activeGesture = null;
      this.gestureTimer = 0;
      const rightUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
      const rightLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
      const rightHand = this.vrm.humanoid?.getNormalizedBoneNode('rightHand');
      if (rightUpperArm) rightUpperArm.rotation.copy(this.REST_RIGHT_UPPER);
      if (rightLowerArm) rightLowerArm.rotation.copy(this.REST_RIGHT_LOWER);
      if (rightHand) rightHand.rotation.set(0, 0, 0);
    }
  }

  public getActiveGesture(): CantarellaGestureName | null {
    return this.activeGesture;
  }

  public isGesturePlaying(): boolean {
    return this.activeGesture !== null;
  }

  public getActiveAutonomousBehavior(): AutonomousIdleBehaviorType | null {
    return this.currentAutonomousAction?.type ?? null;
  }

  public getBlinkWeight(): number {
    return this.currentBlinkWeight;
  }

  /**
   * Clean up resources, reset bone orientations to exact neutral/resting poses,
   * detach controllers, and remove gaze targets from Three.js scene.
   */
  public dispose(): void {
    if (this.gazeTarget.parent === this.scene) {
      this.scene.remove(this.gazeTarget);
    }

    if (this.vrm.lookAt) {
      this.vrm.lookAt.target = null;
    }

    // Reset spine, chest, neck, head bone rotations to clean zero
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) spine.rotation.set(0, 0, 0);

    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) chest.rotation.set(0, 0, 0);

    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
    if (neck) neck.rotation.set(0, 0, 0);

    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) head.rotation.set(0, 0, 0);

    // Restore right and left arm bones to exact normalized resting A-pose
    const rightUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    if (rightUpperArm) rightUpperArm.rotation.copy(this.REST_RIGHT_UPPER);

    const rightLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
    if (rightLowerArm) rightLowerArm.rotation.copy(this.REST_RIGHT_LOWER);

    const rightHand = this.vrm.humanoid?.getNormalizedBoneNode('rightHand');
    if (rightHand) rightHand.rotation.set(0, 0, 0);

    const leftUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    if (leftUpperArm) leftUpperArm.rotation.copy(this.REST_LEFT_UPPER);

    const leftLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
    if (leftLowerArm) leftLowerArm.rotation.copy(this.REST_LEFT_LOWER);

    this.activeGesture = null;
    this.currentAutonomousAction = null;
    this.autonomousTimer = 0;

    // Reset emotion body language state
    this.expressionController = null;
    this.activeEmotion = 'neutral';
    this.targetEmotionWeight = 0;
    this.smoothedEmotionHeadPitch = 0;
    this.smoothedEmotionHeadRoll = 0;
    this.smoothedEmotionHeadYaw = 0;
    this.smoothedEmotionSpinePitch = 0;
    this.smoothedEmotionSpineRoll = 0;
    this.smoothedEmotionSpineYaw = 0;
    this.smoothedEmotionChestPitch = 0;
    this.smoothedEmotionGazeX = 0;
    this.smoothedEmotionGazeY = 0;
    this.smoothedBreathRateMul = 1.0;
    this.smoothedBreathDepthMul = 1.0;
    this.smoothedTorsoSwayMul = 1.0;
    this.emotionGazeOffset.set(0, 0, 0);

    // Reset conversation state
    this.conversationState = 'idle';
    this.smoothedConvHeadPitch = 0;
    this.smoothedConvHeadRoll = 0;
    this.smoothedConvHeadYaw = 0;
    this.smoothedConvSpinePitch = 0;
    this.smoothedConvChestPitch = 0;
    this.smoothedConvGazeX = 0;
    this.smoothedConvGazeY = 0;
    this.convSpeakingCadenceTime = 0;
    this.conversationGazeOffset.set(0, 0, 0);

    // Reset random asset actions
    this.animationManager = null;
    this.randomAssetTimer = 0;
    this.lastAssetMotionId = null;
    this.assetActionLastPlayed.clear();

    if (this.vrm.expressionManager) {
      this.vrm.expressionManager.setValue('blink', 0);
    }
  }
}
