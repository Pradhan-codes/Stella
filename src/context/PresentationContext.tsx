import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PresentationMode, WindowType } from '../types/desktop';

interface PresentationContextType {
  presentationMode: PresentationMode;
  windowType: WindowType;
  setPresentationMode: (mode: PresentationMode) => Promise<void>;
  openCompanionOverlay: () => Promise<void>;
  returnToWorkspace: () => Promise<void>;
  isElectron: boolean;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
}

const PresentationContext = createContext<PresentationContextType | undefined>(undefined);

export const PresentationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isElectron = Boolean(typeof window !== 'undefined' && window.stellaDesktop?.isElectron);
  
  const windowType: WindowType =
    (typeof window !== 'undefined' && window.stellaDesktop?.windowType) ||
    (typeof window !== 'undefined' &&
    (window.location.hash === '#companion' || window.location.search.includes('window=companion'))
      ? 'companion'
      : 'main');

  const [presentationMode, setPresentationModeState] = useState<PresentationMode>(
    windowType === 'companion' ? 'companion-overlay' : 'workspace'
  );

  // Initialize and listen for main process mode changes
  useEffect(() => {
    if (window.stellaDesktop) {
      window.stellaDesktop.getPresentationMode().then((mode) => {
        if (mode === 'workspace' || mode === 'companion-overlay') {
          setPresentationModeState(mode);
        }
      }).catch(console.error);

      const unsubscribe = window.stellaDesktop.onPresentationModeChanged((mode) => {
        setPresentationModeState(mode);
      });

      return unsubscribe;
    }
  }, []);

  // Update HTML & body classes to enforce transparency in companion overlay
  useEffect(() => {
    if (windowType === 'companion' || presentationMode === 'companion-overlay') {
      document.documentElement.classList.add('companion-overlay-active');
      document.body.classList.add('companion-overlay-active');
      document.documentElement.classList.remove('workspace-active');
      document.body.classList.remove('workspace-active');
    } else {
      document.documentElement.classList.add('workspace-active');
      document.body.classList.add('workspace-active');
      document.documentElement.classList.remove('companion-overlay-active');
      document.body.classList.remove('companion-overlay-active');
    }
  }, [windowType, presentationMode]);

  const setPresentationMode = useCallback(
    async (targetMode: PresentationMode) => {
      if (window.stellaDesktop) {
        try {
          const res = await window.stellaDesktop.setPresentationMode(targetMode);
          if (res && res.mode) {
            setPresentationModeState(res.mode);
          }
        } catch (err) {
          console.error('Failed to change presentation mode via IPC:', err);
        }
      } else {
        setPresentationModeState(targetMode);
      }
    },
    []
  );

  const openCompanionOverlay = useCallback(async () => {
    await setPresentationMode('companion-overlay');
  }, [setPresentationMode]);

  const returnToWorkspace = useCallback(async () => {
    await setPresentationMode('workspace');
  }, [setPresentationMode]);

  const minimizeWindow = useCallback(() => {
    if (window.stellaDesktop) {
      window.stellaDesktop.minimizeWindow();
    }
  }, []);

  const maximizeWindow = useCallback(() => {
    if (window.stellaDesktop) {
      window.stellaDesktop.maximizeWindow();
    }
  }, []);

  const closeWindow = useCallback(() => {
    if (window.stellaDesktop) {
      window.stellaDesktop.closeWindow();
    }
  }, []);

  return (
    <PresentationContext.Provider
      value={{
        presentationMode,
        windowType,
        setPresentationMode,
        openCompanionOverlay,
        returnToWorkspace,
        isElectron,
        minimizeWindow,
        maximizeWindow,
        closeWindow,
      }}
    >
      {children}
    </PresentationContext.Provider>
  );
};

export const usePresentation = (): PresentationContextType => {
  const context = useContext(PresentationContext);
  if (!context) {
    throw new Error('usePresentation must be used within a PresentationProvider');
  }
  return context;
};
