export type PresentationMode = 'workspace' | 'companion-overlay';
export type WindowType = 'main' | 'companion';

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
}

declare global {
  interface Window {
    stellaDesktop?: StellaDesktopAPI;
  }
}
