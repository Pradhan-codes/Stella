export type PresentationMode = 'workspace' | 'companion-overlay';
export type WindowType = 'main' | 'companion';

export interface AvatarSyncPayload {
  expression: string;
  intensity?: number;
  duration?: number;
  holdDuration?: number;
  conversationState?: string;
  timestamp?: number;
}

export interface CompanionDialogueTurn {
  turnId: string;
  userMessage?: string;
  assistantText: string;
  expressionHint?: string | null;
  actionId?: string | null;
  actionStatus?: 'dispatched' | 'completed' | 'failed' | 'none';
  status: 'thinking' | 'speaking' | 'completed' | 'error';
  timestamp: number;
}

export interface StellaDesktopAPI {
  isElectron: boolean;
  windowType: WindowType;
  getPresentationMode: () => Promise<PresentationMode>;
  setPresentationMode: (mode: PresentationMode) => Promise<{ success: boolean; mode: PresentationMode }>;
  openCompanionOverlay: () => Promise<{ success: boolean; mode: PresentationMode }>;
  returnToWorkspace: () => Promise<{ success: boolean; mode: PresentationMode }>;
  onPresentationModeChanged: (callback: (mode: PresentationMode) => void) => () => void;
  onPauseRendering: (callback: () => void) => () => void;
  onResumeRendering: (callback: () => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  sendAvatarState?: (state: AvatarSyncPayload) => void;
  getAvatarState?: () => Promise<AvatarSyncPayload | null>;
  onAvatarStateChanged?: (callback: (state: AvatarSyncPayload) => void) => () => void;
  sendDialogueTurn?: (turn: CompanionDialogueTurn) => void;
  getDialogueTurn?: () => Promise<CompanionDialogueTurn | null>;
  onDialogueTurnChanged?: (callback: (turn: CompanionDialogueTurn) => void) => () => void;
  discoverAnimations?: (forceRescan?: boolean) => Promise<import('./animation').AnimationDiscoveryReport>;
  onAnimationsUpdated?: (callback: (report: import('./animation').AnimationDiscoveryReport) => void) => () => void;
}

declare global {
  interface Window {
    stellaDesktop?: StellaDesktopAPI;
  }
}
