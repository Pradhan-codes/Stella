import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';
import {
  VRMAnimation,
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';

export interface VRMAMotionItem {
  id: string;
  file: string;
  url: string;
  name: string;
  nameJp: string;
  hint: string;
  duration?: number;
}

export const VRMA_MOTIONS: VRMAMotionItem[] = [
  {
    id: 'VRMA_01',
    file: 'VRMA_01.vrma',
    url: './animations/VRMA_01.vrma',
    name: 'Show Full Body',
    nameJp: '全身を見せる',
    hint: 'Full body presentation gesture',
    duration: 7.8,
  },
  {
    id: 'VRMA_02',
    file: 'VRMA_02.vrma',
    url: './animations/VRMA_02.vrma',
    name: 'Greeting',
    nameJp: '挨拶',
    hint: 'Polite greeting bow gesture',
    duration: 4.8,
  },
  {
    id: 'VRMA_03',
    file: 'VRMA_03.vrma',
    url: './animations/VRMA_03.vrma',
    name: 'Peace Sign',
    nameJp: 'Vサイン',
    hint: 'Cheerful peace sign pose',
    duration: 7.7,
  },
  {
    id: 'VRMA_04',
    file: 'VRMA_04.vrma',
    url: './animations/VRMA_04.vrma',
    name: 'Shoot',
    nameJp: '撃つ',
    hint: 'Playful celestial finger-gun gesture',
    duration: 6.3,
  },
  {
    id: 'VRMA_05',
    file: 'VRMA_05.vrma',
    url: './animations/VRMA_05.vrma',
    name: 'Spin',
    nameJp: '回る',
    hint: 'Graceful 360-degree spin',
    duration: 3.6,
  },
  {
    id: 'VRMA_06',
    file: 'VRMA_06.vrma',
    url: './animations/VRMA_06.vrma',
    name: 'Model Pose',
    nameJp: 'モデルポーズ',
    hint: 'Confident runway model pose',
    duration: 2.9,
  },
  {
    id: 'VRMA_07',
    file: 'VRMA_07.vrma',
    url: './animations/VRMA_07.vrma',
    name: 'Squat',
    nameJp: '屈伸運動',
    hint: 'Light warmup bending gesture',
    duration: 4.4,
  },
  {
    id: 'VRMA_EXTRA',
    file: 'うでぶんぶん.vrma',
    url: './animations/うでぶんぶん.vrma',
    name: 'Arm Flailing',
    nameJp: 'うでぶんぶん',
    hint: 'Playful arm flailing motion',
    duration: 2.0,
  },
];

export interface AnimationStatus {
  activeMotionId: string | null;
  activeMotionName: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  error?: string | null;
}

export type AnimationStatusListener = (status: AnimationStatus) => void;

// Module-level cache for loaded VRMAnimation objects so we only fetch & parse each file once
const vrmAnimationCache: Map<string, Promise<VRMAnimation>> = new Map();

/**
 * CantarellaAnimationManager
 *
 * Manages one shared THREE.AnimationMixer per avatar instance, loading VRMA motion pack files,
 * smoothly cross-fading actions, preventing overlapping conflicts, and cleanly restoring
 * Cantarella's rest pose without fighting the idle controller.
 */
export class CantarellaAnimationManager {
  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private restClip: THREE.AnimationClip | null = null;
  private restAction: THREE.AnimationAction | null = null;

  // Active playing motion state
  private activeAction: THREE.AnimationAction | null = null;
  private activeMotionId: string | null = null;
  private activeMotionName: string | null = null;
  private isMotionPlaying: boolean = false;
  private isMotionLoading: boolean = false;
  private motionEndTimer: number | null = null;

  // Cache of retargeted THREE.AnimationClips for the current VRM instance
  private clipCache: Map<string, THREE.AnimationClip> = new Map();

  // Status change listeners
  private listeners: Set<AnimationStatusListener> = new Set();

  // GLTF loader configured with VRMAnimationLoaderPlugin
  private loader: GLTFLoader;

  constructor() {
    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  }

  /**
   * Attach a newly loaded or cached VRM instance to this animation manager.
   */
  public attachVRM(vrm: VRM): void {
    if (this.vrm === vrm) return;

    this.detachVRM();
    this.vrm = vrm;

    // Create exactly one AnimationMixer for this avatar instance
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    // Build resting pose AnimationClip based on Cantarella's exact normalized rig
    this.restClip = this.buildRestClip(vrm);
    if (this.restClip) {
      this.restAction = this.mixer.clipAction(this.restClip);
      this.restAction.play();
      this.restAction.weight = 1.0;
    }

    this.clipCache.clear();
    this.notifyListeners();
  }

  /**
   * Detach the current VRM and dispose mixer resources cleanly.
   */
  public detachVRM(): void {
    if (this.motionEndTimer !== null) {
      window.clearTimeout(this.motionEndTimer);
      this.motionEndTimer = null;
    }

    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.vrm) {
        this.mixer.uncacheRoot(this.vrm.scene);
      }
      this.mixer = null;
    }

    this.activeAction = null;
    this.restAction = null;
    this.restClip = null;
    this.activeMotionId = null;
    this.activeMotionName = null;
    this.isMotionPlaying = false;
    this.isMotionLoading = false;
    this.clipCache.clear();
    this.vrm = null;
    this.notifyListeners();
  }

  /**
   * Build a rest AnimationClip containing tracks for all normalized humanoid bones
   * in Cantarella's resting A-pose.
   */
  private buildRestClip(vrm: VRM): THREE.AnimationClip | null {
    if (!vrm.humanoid) return null;

    const tracks: THREE.KeyframeTrack[] = [];
    const qRU = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, -0.04, -1.25));
    const qRL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.12, -0.1));
    const qLU = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0.04, 1.25));
    const qLL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.12, 0.1));
    const qIdentity = new THREE.Quaternion(0, 0, 0, 1);

    const restHipsY = vrm.humanoid.normalizedRestPose?.hips?.position?.[1] ?? 0.81;

    // Collect all humanoid bone nodes
    const boneNames = Object.keys(vrm.humanoid.humanBones) as Array<keyof typeof vrm.humanoid.humanBones>;

    for (const boneName of boneNames) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName as any);
      if (!node) continue;

      let q = qIdentity;
      if (boneName === 'rightUpperArm') q = qRU;
      else if (boneName === 'rightLowerArm') q = qRL;
      else if (boneName === 'leftUpperArm') q = qLU;
      else if (boneName === 'leftLowerArm') q = qLL;

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${node.name}.quaternion`,
          [0, 1],
          [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]
        )
      );

      if (boneName === 'hips') {
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${node.name}.position`,
            [0, 1],
            [0, restHipsY, 0, 0, restHipsY, 0]
          )
        );
      }
    }

    return new THREE.AnimationClip('_cantarellaRestPose', 1, tracks);
  }

  /**
   * Load and retarget a VRMA animation clip to the active VRM instance.
   */
  public async loadClip(motion: VRMAMotionItem): Promise<THREE.AnimationClip | null> {
    if (!this.vrm) return null;

    // Check local clip cache for this VRM
    if (this.clipCache.has(motion.id)) {
      return this.clipCache.get(motion.id)!;
    }

    // Check module-level VRMAnimation download cache
    let animPromise = vrmAnimationCache.get(motion.url);
    if (!animPromise) {
      animPromise = new Promise<VRMAnimation>((resolve, reject) => {
        this.loader.load(
          motion.url,
          (gltf) => {
            const vrmAnimations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
            const vrmAnimation =
              (vrmAnimations && vrmAnimations[0]) ||
              (gltf.userData.vrmAnimation as VRMAnimation | undefined);
            if (vrmAnimation) {
              resolve(vrmAnimation);
            } else {
              reject(new Error(`No VRMAnimation extension found in ${motion.file}`));
            }
          },
          undefined,
          (err) => {
            vrmAnimationCache.delete(motion.url);
            reject(err);
          }
        );
      });
      vrmAnimationCache.set(motion.url, animPromise);
    }

    const vrmAnimation = await animPromise;

    // Retarget animation to the current VRM model (handles VRM 0.x vs 1.0 coordinate conversions)
    const clip = createVRMAnimationClip(vrmAnimation, this.vrm);
    clip.name = motion.id;
    this.clipCache.set(motion.id, clip);
    return clip;
  }

  /**
   * Play an imported VRMA motion by ID.
   * Smoothly cross-fades from rest pose or previous motion, holds during animation,
   * and smoothly cross-fades back to resting A-pose on completion.
   */
  public async playMotion(motionId: string): Promise<boolean> {
    if (!this.vrm || !this.mixer) {
      console.warn('[Cantarella Animation] Cannot play motion: VRM or mixer not attached');
      return false;
    }

    const motion = VRMA_MOTIONS.find((m) => m.id === motionId);
    if (!motion) {
      console.warn(`[Cantarella Animation] Unknown motion ID: ${motionId}`);
      return false;
    }

    // If already playing this exact motion, ignore duplicate trigger
    if (this.activeMotionId === motionId && this.isMotionPlaying) {
      return true;
    }

    if (this.motionEndTimer !== null) {
      window.clearTimeout(this.motionEndTimer);
      this.motionEndTimer = null;
    }

    this.isMotionLoading = true;
    this.notifyListeners();

    try {
      const clip = await this.loadClip(motion);
      if (!clip || !this.mixer || !this.vrm) {
        this.isMotionLoading = false;
        this.notifyListeners();
        return false;
      }

      const prevAction = this.activeAction;
      const newAction = this.mixer.clipAction(clip);

      newAction.reset();
      newAction.setLoop(THREE.LoopOnce, 1);
      newAction.clampWhenFinished = true;

      // Crossfade duration
      const crossfadeTime = 0.35;

      if (prevAction && prevAction !== newAction) {
        prevAction.crossFadeTo(newAction, crossfadeTime, true);
      } else if (this.restAction) {
        this.restAction.crossFadeTo(newAction, crossfadeTime, true);
      }

      newAction.play();

      this.activeAction = newAction;
      this.activeMotionId = motion.id;
      this.activeMotionName = motion.name;
      this.isMotionPlaying = true;
      this.isMotionLoading = false;
      this.notifyListeners();

      // Schedule graceful return to rest pose before clip finishes
      const clipDuration = clip.duration || motion.duration || 4.0;
      const returnFadeTime = 0.45;
      const holdTime = Math.max(0.1, clipDuration - returnFadeTime);

      this.motionEndTimer = window.setTimeout(() => {
        this.returnToRest(returnFadeTime);
      }, holdTime * 1000);

      return true;
    } catch (err) {
      console.error(`[Cantarella Animation] Failed to load or play motion ${motionId}:`, err);
      this.isMotionLoading = false;
      this.isMotionPlaying = false;
      this.activeMotionId = null;
      this.activeMotionName = null;
      this.returnToRest(0.3);
      this.notifyListeners();
      return false;
    }
  }

  /**
   * Smoothly crossfade from active motion back to Cantarella's rest pose.
   */
  public returnToRest(fadeDuration: number = 0.45): void {
    if (this.motionEndTimer !== null) {
      window.clearTimeout(this.motionEndTimer);
      this.motionEndTimer = null;
    }

    if (this.activeAction && this.restAction) {
      this.activeAction.crossFadeTo(this.restAction, fadeDuration, true);
      this.restAction.reset();
      this.restAction.play();

      const actionToStop = this.activeAction;
      window.setTimeout(() => {
        actionToStop.stop();
      }, fadeDuration * 1000);
    } else if (this.restAction) {
      this.restAction.reset();
      this.restAction.fadeIn(fadeDuration);
      this.restAction.play();
    }

    this.activeAction = null;
    this.activeMotionId = null;
    this.activeMotionName = null;
    this.isMotionPlaying = false;
    this.isMotionLoading = false;
    this.notifyListeners();
  }

  /**
   * Stop the currently playing animation and return to rest.
   */
  public stopMotion(fadeDuration: number = 0.35): void {
    this.returnToRest(fadeDuration);
  }

  /**
   * Advance mixer animation for this frame.
   * Call inside the existing requestAnimationFrame loop.
   */
  public update(delta: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  public isPlaying(): boolean {
    return this.isMotionPlaying;
  }

  public isLoading(): boolean {
    return this.isMotionLoading;
  }

  public getActiveMotionId(): string | null {
    return this.activeMotionId;
  }

  public getActiveMotionName(): string | null {
    return this.activeMotionName;
  }

  public getStatus(): AnimationStatus {
    return {
      activeMotionId: this.activeMotionId,
      activeMotionName: this.activeMotionName,
      isPlaying: this.isMotionPlaying,
      isLoading: this.isMotionLoading,
    };
  }

  public subscribe(listener: AnimationStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((fn) => fn(status));
  }

  public dispose(): void {
    this.detachVRM();
    this.listeners.clear();
  }
}

// Module-level singleton instance for shared cross-component access
export const cantarellaAnimationManager = new CantarellaAnimationManager();

// Expose on window for runtime diagnostics and automated tests
if (typeof window !== 'undefined') {
  (window as unknown as { __stellaAnimationManager?: CantarellaAnimationManager }).__stellaAnimationManager =
    cantarellaAnimationManager;
}
