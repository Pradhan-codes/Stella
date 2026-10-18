import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

export interface IdleControllerConfig {
  /** Framing mode to set appropriate eye-height and gaze tracking plane */
  framing?: 'full' | 'portrait';
  /** Enable gentle breathing sway (default: true) */
  enableBreathing?: boolean;
  /** Enable natural randomized blinking (default: true) */
  enableBlinking?: boolean;
  /** Enable subtle head drift (default: true) */
  enableHeadMovement?: boolean;
  /** Enable gentle eye gaze saccades (default: true) */
  enableEyeGaze?: boolean;
}

export type CantarellaGestureName = 'wave' | 'nod';

type BlinkState = 'WAITING' | 'CLOSING' | 'OPENING' | 'DOUBLE_PAUSE';

/**
 * CantarellaIdleController
 *
 * Drives natural, organic idle behaviors:
 * 1. Gentle asymmetric breathing (spine & chest)
 * 2. Biologically plausible blinking (randomized intervals, variable durations, occasional double-blinks)
 * 3. Restrained, multi-frequency subtle head movements (Lissajous curves, no robotic repetition)
 * 4. Micro-saccadic eye gaze adjustments towards the camera/user
 * 5. Leverages VRM's native spring-bone simulation for hair and accessories
 * 6. Coexists with safe, non-destructive gestures (wave, nod) that return to resting pose
 */
export class CantarellaIdleController {
  private vrm: VRM;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private config: Required<IdleControllerConfig>;

  // Breathing state
  private breathTime: number = 0;
  private readonly breathPeriod: number = 3.8; // ~15.8 breaths per minute

  // Blinking state machine
  private blinkState: BlinkState = 'WAITING';
  private blinkTimer: number = 0;
  private timeUntilNextBlink: number = 3.2;
  private readonly closingDuration: number = 0.065; // ~65ms fast eyelid close
  private readonly openingDuration: number = 0.115; // ~115ms smooth reopen
  private readonly doublePauseDuration: number = 0.12; // 120ms between double-blinks
  private isDoubleBlink: boolean = false;
  private hasCompletedFirstOfDouble: boolean = false;
  private currentBlinkWeight: number = 0;

  // Eye Gaze & Micro-saccades
  private gazeTarget: THREE.Object3D;
  private currentGazeOffset: THREE.Vector3 = new THREE.Vector3();
  private targetGazeOffset: THREE.Vector3 = new THREE.Vector3();
  private saccadeTimer: number = 0;
  private timeUntilNextSaccade: number = 3.5;

  // Safe gesture state (wave, nod)
  private activeGesture: CantarellaGestureName | null = null;
  private gestureTimer: number = 0;
  private readonly REST_RIGHT_UPPER = new THREE.Euler(0.08, -0.04, -1.25);
  private readonly REST_RIGHT_LOWER = new THREE.Euler(0, -0.12, -0.1);

  // Idle blending weight (smoothly fades out when an imported motion plays, fades in when it ends)
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
    };

    // Virtual gaze target object placed at the camera position
    this.gazeTarget = new THREE.Object3D();
    this.gazeTarget.name = 'CantarellaGazeTarget';
    this.scene.add(this.gazeTarget);

    // Initial gaze placement aligned with camera
    this.gazeTarget.position.copy(this.camera.position);

    // Attach gaze target to VRM lookAt if lookAt exists
    if (this.vrm.lookAt && this.config.enableEyeGaze) {
      this.vrm.lookAt.target = this.gazeTarget;
      this.vrm.lookAt.autoUpdate = true;
    }

    // Seed randomized intervals
    this.scheduleNextBlink();
    this.scheduleNextSaccade();
  }

  /**
   * Update all idle animation elements for this frame.
   * Call once per frame inside the primary requestAnimationFrame loop.
   *
   * @param delta Frame time delta in seconds
   * @param elapsedTime Total elapsed time in seconds
   * @param isMotionActive If true, an imported gesture/motion is active; suppresses conflicting bone updates
   */
  public update(delta: number, elapsedTime: number, isMotionActive: boolean = false): void {
    if (isMotionActive) {
      this.idleWeight = Math.max(0, this.idleWeight - delta * 3.0);
      if (this.activeGesture) {
        this.activeGesture = null;
        this.gestureTimer = 0;
      }
    } else {
      this.idleWeight = Math.min(1.0, this.idleWeight + delta * 2.0);
    }

    if (this.config.enableBreathing && this.idleWeight > 0.001) {
      this.updateBreathing(delta, this.idleWeight);
    }

    if (this.config.enableHeadMovement && this.idleWeight > 0.001) {
      this.updateHeadMovement(elapsedTime, this.idleWeight);
    }

    if (this.config.enableBlinking) {
      this.updateBlinking(delta);
    }

    if (this.config.enableEyeGaze) {
      this.updateEyeGaze(delta);
    }

    if (this.activeGesture && !isMotionActive) {
      this.updateGesture(delta);
    }
  }

  /**
   * Gentle, asymmetric breathing:
   * Inhalation is slightly faster and builds smoothly; exhalation is gentle and prolonged.
   */
  private updateBreathing(delta: number, weight: number = 1.0): void {
    this.breathTime += delta;
    const cycle = (this.breathTime % this.breathPeriod) / this.breathPeriod;

    // Asymmetric breathing curve:
    // Uses fundamental + second harmonic for natural chest expansion and relaxation
    const breathFactor =
      0.65 * Math.sin(cycle * Math.PI * 2) +
      0.25 * Math.sin(cycle * Math.PI * 4 - Math.PI * 0.3);

    // Subtle spine rotation (pitch sway ~0.014 rad max / ~0.8 degrees)
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.x = breathFactor * 0.013 * weight;
    }

    // Subtle chest rotation (~0.007 rad max)
    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) {
      chest.rotation.x = breathFactor * 0.007 * weight;
    }
  }

  /**
   * Very subtle, non-robotic head movement:
   * Uses multi-frequency Lissajous curves combined with subtle breathing coupling.
   * Motion is restrained to sub-degree and low-degree bounds (max ~1.2 deg).
   */
  private updateHeadMovement(time: number, weight: number = 1.0): void {
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (!head) return;

    // Pitch (slight slow nod drift, synchronized with breath)
    const breathCoupling = Math.sin((this.breathTime % this.breathPeriod) / this.breathPeriod * Math.PI * 2) * 0.003;
    const pitch = (Math.sin(time * 0.32) * 0.009 + Math.sin(time * 0.71) * 0.004 + breathCoupling) * weight;

    // Yaw (gentle, relaxed turn from side to side)
    const yaw = (Math.sin(time * 0.21) * 0.015 + Math.cos(time * 0.44) * 0.006) * weight;

    // Roll (slight head tilt, celestial curiosity)
    const roll = (Math.sin(time * 0.17) * 0.006) * weight;

    head.rotation.set(pitch, yaw, roll);
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

      case 'CLOSING':
        this.blinkTimer += delta;
        const closeProgress = Math.min(1.0, this.blinkTimer / this.closingDuration);
        // Ease in closing (eyelids accelerate as they close)
        this.currentBlinkWeight = closeProgress * closeProgress;

        if (closeProgress >= 1.0) {
          this.blinkState = 'OPENING';
          this.blinkTimer = 0;
        }
        break;

      case 'OPENING':
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

      case 'DOUBLE_PAUSE':
        this.blinkTimer += delta;
        this.currentBlinkWeight = 0;
        if (this.blinkTimer >= this.doublePauseDuration) {
          this.blinkState = 'CLOSING';
          this.blinkTimer = 0;
        }
        break;
    }

    // Apply blink value to expression manager
    this.vrm.expressionManager.setValue('blink', this.currentBlinkWeight);
  }

  private scheduleNextBlink(): void {
    // Randomized interval between 2.4s and 5.4s (human average in conversational/observational state)
    this.timeUntilNextBlink = 2.4 + Math.random() * 3.0;
  }

  /**
   * Gentle micro-saccadic eye gaze movement:
   * Smoothly tracks camera position, adding natural microscopic fixation shifts.
   */
  private updateEyeGaze(delta: number): void {
    this.saccadeTimer += delta;

    if (this.saccadeTimer >= this.timeUntilNextSaccade) {
      this.saccadeTimer = 0;
      this.scheduleNextSaccade();

      // 40% chance to reset to dead center (direct engaging eye contact with user)
      if (Math.random() < 0.4) {
        this.targetGazeOffset.set(0, 0, 0);
      } else {
        // Micro-saccade offset: max ±0.04m horizontally, ±0.025m vertically at ~3m distance
        const ox = (Math.random() - 0.5) * 0.07;
        const oy = (Math.random() - 0.5) * 0.045;
        this.targetGazeOffset.set(ox, oy, 0);
      }
    }

    // Smoothly damp current gaze offset towards target offset (smooth saccadic transition)
    const lerpFactor = Math.min(1.0, delta * 12.0);
    this.currentGazeOffset.lerp(this.targetGazeOffset, lerpFactor);

    // Update virtual gaze target position in Three.js world space
    this.gazeTarget.position.copy(this.camera.position).add(this.currentGazeOffset);
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
        // Stabilize yaw and roll during nod to prevent sideways wobble/chuckle look
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
      const duration = 2.4; // 2.4s: lift (0.5s), 2.5 waves (1.4s), return (0.5s)
      const progress = Math.min(1.0, this.gestureTimer / duration);

      const rightUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
      const rightLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
      const rightHand = this.vrm.humanoid?.getNormalizedBoneNode('rightHand');

      if (rightUpperArm && rightLowerArm) {
        let armLiftFactor = 0;
        let waveFactor = 0;

        if (progress < 0.22) {
          // Phase 1: Smoothly raise arm into greeting pose
          const p = progress / 0.22;
          armLiftFactor = p * p * (3.0 - 2.0 * p); // cubic ease
        } else if (progress <= 0.80) {
          // Phase 2: Hold greeting pose and perform 2.5 friendly wave cycles
          armLiftFactor = 1.0;
          const waveP = (progress - 0.22) / (0.80 - 0.22);
          waveFactor = Math.sin(waveP * Math.PI * 5.0); // 2.5 cycles: starts and ends at exactly 0
        } else {
          // Phase 3: Smoothly return arm to resting A-pose
          const returnP = (progress - 0.80) / (1.0 - 0.80);
          armLiftFactor = 1.0 - returnP * returnP * (3.0 - 2.0 * returnP); // cubic ease return
        }

        // Natural greeting target pose (calibrated to VRM humanoid coordinates):
        // Upper arm raised forward and comfortably outward
        const targetUpperX = -0.15;
        const targetUpperY = 0.35;
        const targetUpperZ = -0.45;

        // Forearm with elbow bent ~80°, hand held near head height beside face
        const targetLowerX = -1.40 + waveFactor * 0.10;
        const targetLowerY = -1.70;
        const targetLowerZ = 0.50 + waveFactor * 0.16;

        rightUpperArm.rotation.set(
          this.REST_RIGHT_UPPER.x + (targetUpperX - this.REST_RIGHT_UPPER.x) * armLiftFactor,
          this.REST_RIGHT_UPPER.y + (targetUpperY - this.REST_RIGHT_UPPER.y) * armLiftFactor,
          this.REST_RIGHT_UPPER.z + (targetUpperZ - this.REST_RIGHT_UPPER.z) * armLiftFactor
        );

        rightLowerArm.rotation.set(
          this.REST_RIGHT_LOWER.x + (targetLowerX - this.REST_RIGHT_LOWER.x) * armLiftFactor,
          this.REST_RIGHT_LOWER.y + (targetLowerY - this.REST_RIGHT_LOWER.y) * armLiftFactor,
          this.REST_RIGHT_LOWER.z + (targetLowerZ - this.REST_RIGHT_LOWER.z) * armLiftFactor
        );

        // Hand bone rotation: palm facing user, small natural wrist wave
        if (rightHand) {
          const targetHandX = 0.10 * armLiftFactor;
          const targetHandY = (waveFactor * 0.08) * armLiftFactor;
          const targetHandZ = (0.20 + waveFactor * 0.22) * armLiftFactor;
          rightHand.rotation.set(targetHandX, targetHandY, targetHandZ);
        }
      }

      if (progress >= 1.0) {
        this.activeGesture = null;
        this.gestureTimer = 0;
        if (rightUpperArm) rightUpperArm.rotation.copy(this.REST_RIGHT_UPPER);
        if (rightLowerArm) rightLowerArm.rotation.copy(this.REST_RIGHT_LOWER);
        if (rightHand) rightHand.rotation.set(0, 0, 0);
      }
    }
  }

  public playGesture(gesture: CantarellaGestureName, isMotionActive: boolean = false): boolean {
    if (this.activeGesture || isMotionActive) {
      // Prevent overlapping gestures from corrupting bone rotations
      return false;
    }
    this.activeGesture = gesture;
    this.gestureTimer = 0;
    return true;
  }

  /**
   * Cancel any running hand-coded gesture and restore arm rest pose immediately.
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

  public getBlinkWeight(): number {
    return this.currentBlinkWeight;
  }

  /**
   * Clean up resources, reset bone orientations, and remove gaze targets from scene.
   */
  public dispose(): void {
    if (this.gazeTarget.parent === this.scene) {
      this.scene.remove(this.gazeTarget);
    }

    if (this.vrm.lookAt) {
      this.vrm.lookAt.target = null;
    }

    // Reset spine and head bone rotations to clean zero
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) spine.rotation.set(0, 0, 0);

    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) chest.rotation.set(0, 0, 0);

    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) head.rotation.set(0, 0, 0);

    // Restore arm bones to exact normalized resting pose
    const rightUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    if (rightUpperArm) rightUpperArm.rotation.copy(this.REST_RIGHT_UPPER);

    const rightLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
    if (rightLowerArm) rightLowerArm.rotation.copy(this.REST_RIGHT_LOWER);

    const rightHand = this.vrm.humanoid?.getNormalizedBoneNode('rightHand');
    if (rightHand) rightHand.rotation.set(0, 0, 0);

    this.activeGesture = null;

    if (this.vrm.expressionManager) {
      this.vrm.expressionManager.setValue('blink', 0);
    }
  }
}
