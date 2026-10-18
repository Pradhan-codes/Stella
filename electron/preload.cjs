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
});
