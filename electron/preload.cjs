const { contextBridge, ipcRenderer } = require('electron');

// Valid presentation modes
const ALLOWED_MODES = new Set(['workspace', 'companion-overlay']);

// Check whether this renderer instance belongs to the companion overlay window
const isCompanionWindow = process.argv.includes('--window-type=companion');

// Expose safe, validated, narrowly scoped desktop API to renderer
contextBridge.exposeInMainWorld('stellaDesktop', {
  isElectron: true,
  windowType: isCompanionWindow ? 'companion' : 'main',

  // Get current presentation mode from main process
  getPresentationMode: () => ipcRenderer.invoke('stella:get-presentation-mode'),

  // Request mode change ('workspace' or 'companion-overlay')
  setPresentationMode: (mode) => {
    if (typeof mode !== 'string' || !ALLOWED_MODES.has(mode)) {
      return Promise.reject(new Error(`Invalid presentation mode: ${mode}`));
    }
    return ipcRenderer.invoke('stella:set-presentation-mode', mode);
  },

  // Convenience navigation shortcuts
  openCompanionOverlay: () => ipcRenderer.invoke('stella:set-presentation-mode', 'companion-overlay'),
  returnToWorkspace: () => ipcRenderer.invoke('stella:set-presentation-mode', 'workspace'),

  // Subscribe to mode changes initiated by main process or shortcuts
  onPresentationModeChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, mode) => {
      if (ALLOWED_MODES.has(mode)) {
        callback(mode);
      }
    };
    ipcRenderer.on('stella:presentation-mode-changed', subscription);
    return () => {
      ipcRenderer.removeListener('stella:presentation-mode-changed', subscription);
    };
  },

  // Visibility and render lifecycle hooks
  onPauseRendering: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = () => callback();
    ipcRenderer.on('stella:pause-rendering', subscription);
    return () => {
      ipcRenderer.removeListener('stella:pause-rendering', subscription);
    };
  },

  onResumeRendering: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = () => callback();
    ipcRenderer.on('stella:resume-rendering', subscription);
    return () => {
      ipcRenderer.removeListener('stella:resume-rendering', subscription);
    };
  },

  // Window control methods
  minimizeWindow: () => ipcRenderer.send('stella:window-minimize'),
  maximizeWindow: () => ipcRenderer.send('stella:window-maximize'),
  closeWindow: () => ipcRenderer.send('stella:window-close'),

  // Avatar state synchronization across windows
  sendAvatarState: (state) => {
    if (!state || typeof state !== 'object') return;
    ipcRenderer.send('stella:avatar-sync', state);
  },

  getAvatarState: () => ipcRenderer.invoke('stella:get-avatar-state'),

  onAvatarStateChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, state) => {
      if (state && typeof state === 'object') {
        callback(state);
      }
    };
    ipcRenderer.on('stella:avatar-state-changed', subscription);
    return () => {
      ipcRenderer.removeListener('stella:avatar-state-changed', subscription);
    };
  },

  // Conversational dialogue turn synchronization across windows
  sendDialogueTurn: (turn) => {
    if (!turn || typeof turn !== 'object') return;
    ipcRenderer.send('stella:dialogue-sync', turn);
  },

  getDialogueTurn: () => ipcRenderer.invoke('stella:get-dialogue-turn'),

  onDialogueTurnChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, turn) => {
      if (turn && typeof turn === 'object') {
        callback(turn);
      }
    };
    ipcRenderer.on('stella:dialogue-turn-changed', subscription);
    return () => {
      ipcRenderer.removeListener('stella:dialogue-turn-changed', subscription);
    };
  },

  // Dynamic Animation Discovery
  discoverAnimations: (forceRescan) =>
    ipcRenderer.invoke('stella:discover-animations', Boolean(forceRescan)),

  onAnimationsUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, report) => {
      if (report && typeof report === 'object') {
        callback(report);
      }
    };
    ipcRenderer.on('stella:animations-updated', subscription);
    return () => {
      ipcRenderer.removeListener('stella:animations-updated', subscription);
    };
  },
});
