/**
 * Animation System Types (Dynamic VRM Animation Integration)
 */

export type AnimationCategory =
  | 'idle'
  | 'sitting'
  | 'cute_poses'
  | 'reactions_happy'
  | 'reactions_sad'
  | 'reactions_surprised'
  | 'eye_gestures'
  | 'dance'
  | 'conversational'
  | 'action'
  | 'custom';

export type AnimationCompatibility =
  | 'compatible'
  | 'incompatible'
  | 'unsupported_format';

export interface DiscoveredAnimationItem {
  id: string;
  fileName: string;
  url: string;
  displayName: string;
  displayNameJp?: string;
  category: AnimationCategory;
  format: 'vrma' | 'glb' | 'gltf' | 'unknown';
  compatibility: AnimationCompatibility;
  compatibilityReason?: string;
  duration: number; // in seconds
  fileSizeBytes: number;
  boneCount?: number;
  hasFacialTracks?: boolean;
  isLoop?: boolean;
  tags?: string[];
  aliases?: string[];
  description?: string;
}

export interface AnimationDiscoveryReport {
  scannedAt: number;
  directory: string;
  totalFound: number;
  compatibleCount: number;
  incompatibleCount: number;
  animations: DiscoveredAnimationItem[];
}

export interface PlayMotionOptions {
  loop?: boolean;
  crossfadeDuration?: number;
  priority?: number; // 0=idle, 1=conversational, 2=user-command/dance, 3=emergency/stop
  onComplete?: () => void;
  overrideMouth?: boolean; // default false (preserves lip-sync)
}

export interface AnimationStatus {
  activeMotionId: string | null;
  activeMotionName: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isPaused: boolean;
  isLooping: boolean;
  category: AnimationCategory | null;
  error?: string | null;
}
