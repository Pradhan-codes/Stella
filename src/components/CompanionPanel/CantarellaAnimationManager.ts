import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';
import {
  VRMAnimation,
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';
import {
  DiscoveredAnimationItem,
  AnimationDiscoveryReport,
  AnimationStatus,
  PlayMotionOptions,
  AnimationCategory,
} from '../../types/animation';

export type {
  DiscoveredAnimationItem,
  AnimationStatus,
  PlayMotionOptions,
  AnimationCategory,
};

// Backward compatibility alias for existing code
export type VRMAMotionItem = DiscoveredAnimationItem & {
  file: string;
  name: string;
  nameJp: string;
  hint: string;
};

export type AnimationStatusListener = (status: AnimationStatus) => void;

// Module-level cache for parsed VRMAnimation glTF chunks
const vrmAnimationCache: Map<string, Promise<VRMAnimation>> = new Map();

/**
 * Base curated fallback animations used when running offline or before Electron IPC resolves.
 */
const DEFAULT_ANIMATION_ITEMS: DiscoveredAnimationItem[] = [
  {
    id: 'reading_loop',
    fileName: 'Reading (Loop).vrma',
    url: './animations/' + encodeURIComponent('Reading (Loop).vrma'),
    displayName: 'Reading (Sitting Loop)',
    displayNameJp: '読書（ループ）',
    category: 'idle',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation (sitting/reading loop)',
    duration: 757.51,
    fileSizeBytes: 19236160,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: true,
    tags: ['idle', 'sitting', 'reading', 'loop'],
    aliases: ['reading', 'read', 'read a book', 'sitting and reading', 'reading loop', 'sit and read'],
    description: 'Sitting relaxed while reading a book in a peaceful loop',
  },
  {
    id: 'happy_synthesizer',
    fileName: 'ハッピーシンセサイザ.vrma',
    url: './animations/' + encodeURIComponent('ハッピーシンセサイザ.vrma'),
    displayName: 'Happy Synthesizer',
    displayNameJp: 'ハッピーシンセサイザ',
    category: 'dance',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation (Happy Synthesizer dance)',
    duration: 19.93,
    fileSizeBytes: 821172,
    boneCount: 51,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['dance', 'energetic', 'music'],
    aliases: ['happy synthesizer', 'dance', 'can you dance', 'dance for me', 'synthesizer dance', 'happy dance'],
    description: 'Upbeat energetic dance to Happy Synthesizer',
  },
  {
    id: 'VRMA_01',
    fileName: 'VRMA_01.vrma',
    url: './animations/VRMA_01.vrma',
    displayName: 'Show Full Body',
    displayNameJp: '全身を見せる',
    category: 'action',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 11.8,
    fileSizeBytes: 1348388,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['presentation', 'full_body', 'action'],
    aliases: ['show full body', 'full body', 'show yourself', 'present yourself', 'presentation', 'look at you', 'vrma_01'],
    description: 'Full body presentation gesture',
  },
  {
    id: 'VRMA_02',
    fileName: 'VRMA_02.vrma',
    url: './animations/VRMA_02.vrma',
    displayName: 'Greeting Bow',
    displayNameJp: '挨拶',
    category: 'conversational',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 7.27,
    fileSizeBytes: 854284,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['greeting', 'bow', 'polite', 'conversational'],
    aliases: ['greeting', 'greeting bow', 'bow', 'curtsy', 'polite bow', 'formal bow', 'bow for me', 'vrma_02'],
    description: 'Polite greeting bow gesture',
  },
  {
    id: 'VRMA_03',
    fileName: 'VRMA_03.vrma',
    url: './animations/VRMA_03.vrma',
    displayName: 'Peace Sign',
    displayNameJp: 'Vサイン',
    category: 'cute_poses',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 11.68,
    fileSizeBytes: 1335704,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['peace', 'cute', 'pose'],
    aliases: ['peace sign', 'peace', 'victory sign', 'v sign', 'peace pose', 'show peace sign', 'vrma_03'],
    description: 'Cheerful peace sign pose',
  },
  {
    id: 'VRMA_04',
    fileName: 'VRMA_04.vrma',
    url: './animations/VRMA_04.vrma',
    displayName: 'Shoot (Finger Gun)',
    displayNameJp: '撃つ',
    category: 'cute_poses',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 9.6,
    fileSizeBytes: 1108548,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['shoot', 'finger_gun', 'playful'],
    aliases: ['shoot', 'finger gun', 'finger guns', 'pew pew', 'bang', 'shoot me', 'celestial shot', 'vrma_04'],
    description: 'Playful celestial finger-gun gesture',
  },
  {
    id: 'VRMA_05',
    fileName: 'VRMA_05.vrma',
    url: './animations/VRMA_05.vrma',
    displayName: 'Spin (360)',
    displayNameJp: '回る',
    category: 'action',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 9.32,
    fileSizeBytes: 632316,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['spin', 'twirl', 'action'],
    aliases: ['spin', 'spin around', 'twirl', 'turn around', 'rotate', 'do a spin', 'can you spin', 'vrma_05'],
    description: 'Graceful 360-degree spin',
  },
  {
    id: 'VRMA_06',
    fileName: 'VRMA_06.vrma',
    url: './animations/VRMA_06.vrma',
    displayName: 'Model Pose',
    displayNameJp: 'モデルポーズ',
    category: 'cute_poses',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 7.52,
    fileSizeBytes: 518364,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['pose', 'model', 'runway'],
    aliases: ['model pose', 'strike a pose', 'pose for me', 'pose', 'show me a pose', 'runway pose', 'vrma_06'],
    description: 'Confident runway model pose',
  },
  {
    id: 'VRMA_07',
    fileName: 'VRMA_07.vrma',
    url: './animations/VRMA_07.vrma',
    displayName: 'Squat Warmup',
    displayNameJp: '屈伸運動',
    category: 'action',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 11.52,
    fileSizeBytes: 771944,
    boneCount: 52,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['squat', 'warmup', 'exercise'],
    aliases: ['squat', 'do a squat', 'bend down', 'warmup squat', 'crouch', 'exercise squat', 'vrma_07'],
    description: 'Light warmup bending gesture',
  },
  {
    id: 'VRMA_EXTRA',
    fileName: 'うでぶんぶん.vrma',
    url: './animations/' + encodeURIComponent('うでぶんぶん.vrma'),
    displayName: 'Arm Flailing',
    displayNameJp: 'うでぶんぶん',
    category: 'reactions_surprised',
    format: 'vrma',
    compatibility: 'compatible',
    compatibilityReason: 'Validated VRM humanoid animation',
    duration: 1.1,
    fileSizeBytes: 77728,
    boneCount: 51,
    hasFacialTracks: false,
    isLoop: false,
    tags: ['flailing', 'surprised', 'excited'],
    aliases: ['arm flailing', 'flail your arms', 'flail', 'wave arms', 'udebunbun', 'flailing', 'vrma_extra'],
    description: 'Playful arm flailing motion',
  },
];

// Helper to convert DiscoveredAnimationItem to legacy VRMAMotionItem
function toLegacyMotionItem(item: DiscoveredAnimationItem): VRMAMotionItem {
  return {
    ...item,
    file: item.fileName,
    name: item.displayName,
    nameJp: item.displayNameJp || item.displayName,
    hint: item.description || '',
  };
}

// Mutable exported array for backward compatibility
export let VRMA_MOTIONS: VRMAMotionItem[] = DEFAULT_ANIMATION_ITEMS.map(toLegacyMotionItem);

/**
 * CantarellaAnimationManager
 *
 * Dynamic, extensible animation system for Cantarella's VRM companion.
 * Manages one shared THREE.AnimationMixer per avatar instance, dynamically discovering
 * local animation assets, retargeting humanoid bones on demand, smoothly cross-fading actions,
 * isolating lip-sync and facial expressions, and cleanly restoring idle posture.
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
  private activeCategory: AnimationCategory | null = null;
  private activePriority: number = 0;
  private isMotionPlaying: boolean = false;
  private isMotionLoading: boolean = false;
  private isMotionPaused: boolean = false;
  private isMotionLooping: boolean = false;
  private onCompleteCallback: (() => void) | null = null;

  // Frame-accurate return-to-rest tracking
  private isReturningToRest: boolean = false;
  private returnFadeTimer: number = 0;
  private returnFadeDuration: number = 0.5;

  // Dynamic animation registry
  private discoveredAnimations: Map<string, DiscoveredAnimationItem> = new Map();
  private aliasMap: Map<string, DiscoveredAnimationItem> = new Map();

  // Cache of retargeted THREE.AnimationClips for the current VRM instance
  private clipCache: Map<string, THREE.AnimationClip> = new Map();

  // Status change listeners
  private listeners: Set<AnimationStatusListener> = new Set();

  // GLTF loader configured with VRMAnimationLoaderPlugin
  private loader: GLTFLoader;

  constructor() {
    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    // Initialize with default known animations
    this.registerDiscoveredAnimations(DEFAULT_ANIMATION_ITEMS);

    // Auto-discover asynchronously on startup
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.discoverAndRegisterAnimations().catch((err) => {
          console.warn('[Cantarella Animation] Initial auto-discovery notice:', err.message);
        });
      }, 50);
    }
  }

  /**
   * Discover animations dynamically from backend or manifest.
   */
  public async discoverAndRegisterAnimations(forceRescan = false): Promise<DiscoveredAnimationItem[]> {
    let items: DiscoveredAnimationItem[] = [];

    // 1. Try Electron IPC backend discovery (scans directory and parses binary glTF headers)
    if (typeof window !== 'undefined' && window.stellaDesktop?.discoverAnimations) {
      try {
        const report = await window.stellaDesktop.discoverAnimations(forceRescan);
        if (report && Array.isArray(report.animations) && report.animations.length > 0) {
          items = report.animations;
        }
      } catch (ipcErr) {
        console.warn('[Cantarella Animation] Electron discovery fallback:', ipcErr);
      }
    }

    // 2. Try fetching manifest.json (for web dev server or test runner)
    if (items.length === 0 && typeof fetch !== 'undefined') {
      try {
        const res = await fetch(`./animations/manifest.json?t=${forceRescan ? Date.now() : 0}`);
        if (res.ok) {
          const manifest: AnimationDiscoveryReport = await res.json();
          if (manifest && Array.isArray(manifest.animations) && manifest.animations.length > 0) {
            items = manifest.animations;
          }
        }
      } catch {
        // Fall back to default items
      }
    }

    if (items.length === 0) {
      items = DEFAULT_ANIMATION_ITEMS;
    }

    this.registerDiscoveredAnimations(items);
    return items;
  }

  /**
   * Register a list of discovered animation items into the registry.
   */
  public registerDiscoveredAnimations(items: DiscoveredAnimationItem[]): void {
    this.discoveredAnimations.clear();
    this.aliasMap.clear();

    for (const item of items) {
      this.discoveredAnimations.set(item.id, item);

      // Support lookup by uppercase ID (e.g. VRMA_01), lowercase, and filename
      this.aliasMap.set(item.id.toLowerCase(), item);
      this.aliasMap.set(item.fileName.toLowerCase(), item);
      this.aliasMap.set(item.displayName.toLowerCase(), item);

      // Support explicit aliases
      if (Array.isArray(item.aliases)) {
        for (const alias of item.aliases) {
          this.aliasMap.set(alias.toLowerCase().trim(), item);
        }
      }

      // Legacy ID aliases
      if (item.id === 'vrma_01') this.aliasMap.set('vrma_01', item);
      if (item.id === 'vrma_02') this.aliasMap.set('vrma_02', item);
      if (item.id === 'vrma_03') this.aliasMap.set('vrma_03', item);
      if (item.id === 'vrma_04') this.aliasMap.set('vrma_04', item);
      if (item.id === 'vrma_05') this.aliasMap.set('vrma_05', item);
      if (item.id === 'vrma_06') this.aliasMap.set('vrma_06', item);
      if (item.id === 'vrma_07') this.aliasMap.set('vrma_07', item);
      if (item.id === 'udebunbun') {
        this.aliasMap.set('vrma_extra', item);
        this.aliasMap.set('udebunbun', item);
      }
    }

    // Update the legacy exported array in-place
    VRMA_MOTIONS = items.map(toLegacyMotionItem);
    this.notifyListeners();
  }

  /**
   * Get all discovered animations.
   */
  public getDiscoveredMotions(): DiscoveredAnimationItem[] {
    return Array.from(this.discoveredAnimations.values());
  }

  /**
   * Get all compatible animations verified for playback.
   */
  public getCompatibleMotions(): DiscoveredAnimationItem[] {
    return Array.from(this.discoveredAnimations.values()).filter(
      (item) => item.compatibility === 'compatible'
    );
  }

  /**
   * Get animations by category.
   */
  public getMotionsByCategory(category: AnimationCategory): DiscoveredAnimationItem[] {
    return Array.from(this.discoveredAnimations.values()).filter(
      (item) => item.category === category
    );
  }

  /**
   * Find an animation by ID, alias, or filename.
   */
  public getMotion(idOrAlias: string): DiscoveredAnimationItem | undefined {
    if (!idOrAlias) return undefined;
    const direct = this.discoveredAnimations.get(idOrAlias);
    if (direct) return direct;
    return this.aliasMap.get(idOrAlias.toLowerCase().trim());
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
    this.isReturningToRest = false;
    this.returnFadeTimer = 0;

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
    this.activeCategory = null;
    this.activePriority = 0;
    this.isMotionPlaying = false;
    this.isMotionLoading = false;
    this.isMotionPaused = false;
    this.isMotionLooping = false;
    this.onCompleteCallback = null;
    this.clipCache.clear();
    this.vrm = null;
    this.notifyListeners();
  }

  /**
   * Build a rest AnimationClip containing tracks for normalized humanoid bones
   * in Cantarella's resting A-pose (hips, legs, arms).
   *
   * EXCLUDES spine, chest, upperChest, neck, head, and eyes so CantarellaIdleController
   * has exclusive, non-conflicting control of upper-body posture, breathing, and
   * active emotion angles.
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

    const REST_TRACK_BONES = new Set([
      'hips',
      'leftShoulder',
      'leftUpperArm',
      'leftLowerArm',
      'leftHand',
      'rightShoulder',
      'rightUpperArm',
      'rightLowerArm',
      'rightHand',
      'leftUpperLeg',
      'leftLowerLeg',
      'leftFoot',
      'leftToes',
      'rightUpperLeg',
      'rightLowerLeg',
      'rightFoot',
      'rightToes',
    ]);

    for (const boneName of REST_TRACK_BONES) {
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
   * Load and retarget a VRMA animation clip to the active VRM instance on demand.
   */
  public async loadClip(motion: DiscoveredAnimationItem): Promise<THREE.AnimationClip | null> {
    if (!this.vrm) return null;

    // Check local clip cache for this VRM
    if (this.clipCache.has(motion.id)) {
      return this.clipCache.get(motion.id)!;
    }

    // Check module-level VRMAnimation download/parse cache
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
              reject(new Error(`No VRMAnimation extension found in ${motion.fileName}`));
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

    // Retarget animation to the current VRM model
    const clip = createVRMAnimationClip(vrmAnimation, this.vrm);

    // Explicit channel ownership: strip mouth morph/vowel tracks so body motions never fight lip-sync
    const MOUTH_TRACK_REGEX = /VRMExpression_(aa|ih|ou|ee|oh)|blendshape.*(mouth|vowel|viseme)/i;
    clip.tracks = clip.tracks.filter((t) => !MOUTH_TRACK_REGEX.test(t.name));

    clip.name = motion.id;
    this.clipCache.set(motion.id, clip);
    return clip;
  }

  /**
   * Play an imported or discovered motion by ID or alias.
   * Smoothly cross-fades from rest pose or previous motion, holds during animation,
   * and smoothly cross-fades back to resting A-pose on completion.
   */
  public async playMotion(motionIdOrAlias: string, options: PlayMotionOptions = {}): Promise<boolean> {
    if (!this.vrm || !this.mixer) {
      console.warn('[Cantarella Animation] Cannot play motion: VRM or mixer not attached');
      return false;
    }

    const motion = this.getMotion(motionIdOrAlias);
    if (!motion) {
      console.warn(`[Cantarella Animation] Unknown motion ID or alias: ${motionIdOrAlias}`);
      this.notifyListeners();
      return false;
    }

    if (motion.compatibility !== 'compatible') {
      const reason = motion.compatibilityReason || 'Incompatible animation file';
      console.warn(`[Cantarella Animation] Cannot play '${motion.displayName}': ${reason}`);
      this.notifyListeners();
      return false;
    }

    const requestedPriority = options.priority ?? 1;

    // If currently playing a higher priority animation, do not interrupt
    if (this.isMotionPlaying && this.activePriority > requestedPriority) {
      console.log(
        `[Cantarella Animation] Motion '${motion.displayName}' (priority ${requestedPriority}) deferred: active motion has higher priority (${this.activePriority})`
      );
      return false;
    }

    // If already playing this exact motion and it is looping, ignore redundant trigger
    if (this.activeMotionId === motion.id && this.isMotionPlaying && this.isMotionLooping) {
      return true;
    }

    this.isReturningToRest = false;
    this.returnFadeTimer = 0;
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

      const isLoop = options.loop !== undefined ? options.loop : Boolean(motion.isLoop);

      newAction.reset();
      newAction.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, isLoop ? Infinity : 1);
      newAction.clampWhenFinished = !isLoop;
      newAction.paused = false;

      // Crossfade duration
      const crossfadeTime = options.crossfadeDuration ?? 0.35;

      if (prevAction && prevAction !== newAction) {
        prevAction.crossFadeTo(newAction, crossfadeTime, false);
      } else if (this.restAction) {
        this.restAction.crossFadeTo(newAction, crossfadeTime, false);
      }

      newAction.play();

      this.activeAction = newAction;
      this.activeMotionId = motion.id;
      this.activeMotionName = motion.displayName;
      this.activeCategory = motion.category;
      this.activePriority = requestedPriority;
      this.isMotionPlaying = true;
      this.isMotionLoading = false;
      this.isMotionPaused = false;
      this.isMotionLooping = isLoop;
      this.onCompleteCallback = options.onComplete || null;

      this.notifyListeners();
      return true;
    } catch (err) {
      console.error(`[Cantarella Animation] Failed to load or play motion ${motion.id}:`, err);
      this.isMotionLoading = false;
      this.isMotionPlaying = false;
      this.activeMotionId = null;
      this.activeMotionName = null;
      this.activeCategory = null;
      this.activePriority = 0;
      this.startReturnToRest(0.3);
      this.notifyListeners();
      return false;
    }
  }

  /**
   * Pause active motion playback.
   */
  public pauseMotion(): void {
    if (this.activeAction && this.isMotionPlaying && !this.isMotionPaused) {
      this.activeAction.paused = true;
      this.isMotionPaused = true;
      this.notifyListeners();
    }
  }

  /**
   * Resume active motion playback.
   */
  public resumeMotion(): void {
    if (this.activeAction && this.isMotionPlaying && this.isMotionPaused) {
      this.activeAction.paused = false;
      this.isMotionPaused = false;
      this.notifyListeners();
    }
  }

  public isPaused(): boolean {
    return this.isMotionPaused;
  }

  /**
   * Smoothly crossfade from active motion back to Cantarella's rest pose.
   */
  public startReturnToRest(fadeDuration: number = 0.5): void {
    if (this.isReturningToRest) return;
    this.isReturningToRest = true;
    this.returnFadeTimer = 0;
    this.returnFadeDuration = Math.max(0.05, fadeDuration);

    if (this.activeAction && this.restAction) {
      this.activeAction.crossFadeTo(this.restAction, this.returnFadeDuration, false);
      this.restAction.reset();
      this.restAction.play();
    } else if (this.restAction) {
      this.restAction.reset();
      this.restAction.fadeIn(this.returnFadeDuration);
      this.restAction.play();
    }

    this.notifyListeners();
  }

  /**
   * Completes the return to rest pose once the crossfade finishes.
   */
  private completeReturnToRest(): void {
    const cb = this.onCompleteCallback;
    this.onCompleteCallback = null;

    if (this.activeAction) {
      this.activeAction.stop();
      this.activeAction = null;
    }

    this.isReturningToRest = false;
    this.isMotionPlaying = false;
    this.activeMotionId = null;
    this.activeMotionName = null;
    this.activeCategory = null;
    this.activePriority = 0;
    this.isMotionLoading = false;
    this.isMotionPaused = false;
    this.isMotionLooping = false;
    this.notifyListeners();

    cb?.();
  }

  public returnToRest(fadeDuration: number = 0.5): void {
    this.startReturnToRest(fadeDuration);
  }

  public stopMotion(fadeDuration: number = 0.35): void {
    this.startReturnToRest(fadeDuration);
  }

  /**
   * Advance mixer animation for this frame and track return-to-rest progress.
   */
  public update(delta: number): void {
    if (!this.mixer) return;

    if (!this.isMotionPaused) {
      this.mixer.update(delta);
    }

    // Frame-accurate return-to-rest tracking based on actual mixer time
    if (
      this.isMotionPlaying &&
      this.activeAction &&
      !this.isMotionLooping &&
      !this.isReturningToRest &&
      !this.isMotionPaused
    ) {
      const clip = this.activeAction.getClip();
      const clipDuration = clip.duration;
      const returnFadeDuration = 0.5;

      if (this.activeAction.time >= Math.max(0.1, clipDuration - returnFadeDuration)) {
        this.startReturnToRest(returnFadeDuration);
      }
    } else if (this.isReturningToRest) {
      this.returnFadeTimer += delta;
      if (this.returnFadeTimer >= this.returnFadeDuration) {
        this.completeReturnToRest();
      }
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

  public getActiveCategory(): AnimationCategory | null {
    return this.activeCategory;
  }

  public getStatus(): AnimationStatus {
    return {
      activeMotionId: this.activeMotionId,
      activeMotionName: this.activeMotionName,
      isPlaying: this.isMotionPlaying,
      isLoading: this.isMotionLoading,
      isPaused: this.isMotionPaused,
      isLooping: this.isMotionLooping,
      category: this.activeCategory,
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
