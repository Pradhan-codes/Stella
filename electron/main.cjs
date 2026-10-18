const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let companionWindow = null;
let currentMode = 'workspace';
let isTransitioning = false;

// Ensure only a single instance of Stella runs
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function loadContent(win, hash = '') {
  const distPath = path.join(__dirname, '../dist/index.html');
  if (process.argv.includes('--test-mode')) {
    win.loadFile(distPath, hash ? { hash } : undefined);
  } else {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    const req = http.get(devServerUrl, (res) => {
      if (res.statusCode && res.statusCode < 400) {
        win.loadURL(hash ? `${devServerUrl}#${hash}` : devServerUrl);
      } else {
        win.loadFile(distPath, hash ? { hash } : undefined);
      }
    });
    req.on('error', () => {
      win.loadFile(distPath, hash ? { hash } : undefined);
    });
    req.setTimeout(800, () => {
      req.destroy();
      win.loadFile(distPath, hash ? { hash } : undefined);
    });
  }
}

// --------------------------------------------------------------------------
// 1. Main Stella Window (Opaque, regular application window)
// --------------------------------------------------------------------------
function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const initialWidth = Math.min(1280, Math.round(screenWidth * 0.9));
  const initialHeight = Math.min(840, Math.round(screenHeight * 0.9));
  const initialX = Math.round((screenWidth - initialWidth) / 2);
  const initialY = Math.round((screenHeight - initialHeight) / 2);

  mainWindow = new BrowserWindow({
    x: initialX,
    y: initialY,
    width: initialWidth,
    height: initialHeight,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#06040c',
    hasShadow: true,
    alwaysOnTop: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: ['--window-type=main'],
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('console-message', (event) => {
    console.log(`[Main Renderer Log] ${event.message}`);
  });

  loadContent(mainWindow);

  let verificationStarted = false;
  mainWindow.webContents.on('did-finish-load', () => {
    if (process.argv.includes('--test-mode') && !verificationStarted) {
      verificationStarted = true;
      runAutomatedVerification().catch((err) => {
        console.error('AUTOMATED VERIFICATION FAILED:', err);
        process.exit(1);
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.destroy();
      companionWindow = null;
    }
    app.quit();
  });

  return mainWindow;
}

// --------------------------------------------------------------------------
// 2. Desktop Companion Overlay Window (Frameless, Transparent, Always-on-top)
// --------------------------------------------------------------------------
function createCompanionWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const companionWidth = 320;
  const companionHeight = 490;
  // Position near lower-right of the desktop, safely above the Windows taskbar
  const posX = Math.round(workArea.x + workArea.width - companionWidth - 28);
  const posY = Math.round(workArea.y + workArea.height - companionHeight - 20);

  companionWindow = new BrowserWindow({
    x: posX,
    y: posY,
    width: companionWidth,
    height: companionHeight,
    minWidth: 240,
    minHeight: 360,
    maxWidth: 580,
    maxHeight: 880,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: ['--window-type=companion'],
    },
  });

  companionWindow.setAlwaysOnTop(true, 'screen-saver');

  companionWindow.webContents.on('console-message', (event) => {
    console.log(`[Companion Renderer Log] ${event.message}`);
  });

  loadContent(companionWindow, 'companion');

  // If user closes companion overlay window, safely restore main Stella window
  companionWindow.on('close', (e) => {
    if (currentMode === 'companion-overlay' && !app.isQuitting) {
      e.preventDefault();
      switchToWorkspaceMode();
    }
  });

  companionWindow.on('closed', () => {
    companionWindow = null;
    if (currentMode === 'companion-overlay') {
      switchToWorkspaceMode();
    }
  });

  return companionWindow;
}

// --------------------------------------------------------------------------
// 3. Mutual Exclusion & Presentation Mode Controller
// --------------------------------------------------------------------------
async function switchToCompanionMode() {
  if (isTransitioning) return { success: true, mode: currentMode };
  isTransitioning = true;

  try {
    // 1. Create or retrieve companion window
    if (!companionWindow || companionWindow.isDestroyed()) {
      companionWindow = createCompanionWindow();
      await new Promise((resolve) => {
        companionWindow.once('ready-to-show', resolve);
        setTimeout(resolve, 2000);
      });
    }

    // 2. Show companion overlay and instruct it to resume rendering
    companionWindow.setAlwaysOnTop(true, 'screen-saver');
    companionWindow.show();
    companionWindow.focus();
    if (companionWindow.webContents) {
      companionWindow.webContents.send('stella:resume-rendering');
      companionWindow.webContents.send('stella:presentation-mode-changed', 'companion-overlay');
    }

    // 3. Hide main Stella window (mutual exclusion) and pause rendering
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stella:pause-rendering');
      mainWindow.webContents.send('stella:presentation-mode-changed', 'companion-overlay');
      mainWindow.hide();
    }

    currentMode = 'companion-overlay';
    return { success: true, mode: 'companion-overlay' };
  } catch (err) {
    console.error('Error during mode transition to companion-overlay:', err);
    // Fail-safe recovery: restore accessible main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    currentMode = 'workspace';
    return { success: false, error: String(err), mode: currentMode };
  } finally {
    isTransitioning = false;
  }
}

async function switchToWorkspaceMode() {
  if (isTransitioning) return { success: true, mode: currentMode };
  isTransitioning = true;

  try {
    // 1. Hide companion window and instruct it to pause rendering
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.webContents.send('stella:pause-rendering');
      companionWindow.hide();
    }

    // 2. Restore and focus main Stella window
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
    } else {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      if (mainWindow.webContents) {
        mainWindow.webContents.send('stella:resume-rendering');
        mainWindow.webContents.send('stella:presentation-mode-changed', 'workspace');
      }
    }

    currentMode = 'workspace';
    return { success: true, mode: 'workspace' };
  } catch (err) {
    console.error('Error during mode transition to workspace:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    currentMode = 'workspace';
    return { success: false, error: String(err), mode: currentMode };
  } finally {
    isTransitioning = false;
  }
}

// --------------------------------------------------------------------------
// 4. IPC Handlers
// --------------------------------------------------------------------------
ipcMain.handle('stella:get-presentation-mode', () => {
  return currentMode;
});

ipcMain.handle('stella:set-presentation-mode', async (_event, targetMode) => {
  if (targetMode === currentMode) {
    return { success: true, mode: currentMode };
  }

  if (targetMode === 'companion-overlay') {
    return await switchToCompanionMode();
  }

  if (targetMode === 'workspace') {
    return await switchToWorkspaceMode();
  }

  throw new Error(`Unsupported mode: ${targetMode}`);
});

ipcMain.on('stella:window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});

ipcMain.on('stella:window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (win === companionWindow) {
      // Maximizing in companion mode returns to workspace
      switchToWorkspaceMode();
      return;
    }
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('stella:window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (win === companionWindow) {
      // In companion mode, close button safely returns to workspace
      switchToWorkspaceMode();
      return;
    }
    win.close();
  }
});

// App Lifecycle
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --------------------------------------------------------------------------
// 5. Automated Verification Suite (Executed only when --test-mode flag is passed)
// --------------------------------------------------------------------------
async function runAutomatedVerification() {
  console.log('\n======================================================');
  console.log('STARTING STELLA TWO-WINDOW ARCHITECTURE VERIFICATION');
  console.log('======================================================\n');

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await sleep(2500); // Allow initial React mount and Three.js canvas setup

  // Test 1: Main Window Initial State
  console.log('TEST 1: Main Stella Window Initial Properties');
  console.log(`- Current Mode: ${currentMode}`);
  console.log(`- Main Window Visible: ${mainWindow.isVisible()}`);
  console.log(`- Main Window Always-on-top: ${mainWindow.isAlwaysOnTop()} (expected: false)`);
  console.log(`- Companion Window Exists: ${companionWindow !== null} (expected: false)`);

  if (!mainWindow.isVisible()) throw new Error('Main window should be visible initially');
  if (mainWindow.isAlwaysOnTop()) throw new Error('Main window should NOT be always-on-top');
  if (companionWindow !== null) throw new Error('Companion window should not exist prior to activation');

  // Test 2: Main Window DOM & Preload API
  console.log('\nTEST 2: Main Window Preload API & Observatory Presentation');
  const mainDomState = await mainWindow.webContents.executeJavaScript(`
    (() => {
      return {
        hasDesktopApi: Boolean(window.stellaDesktop),
        isElectron: window.stellaDesktop?.isElectron,
        windowType: window.stellaDesktop?.windowType,
        hasObservatory: Boolean(document.getElementById('observatory-root')),
        hasCompanionBtn: Boolean(document.getElementById('companionModeBtn')),
        hasOverlay: Boolean(document.getElementById('stella-companion-overlay')),
      };
    })()
  `);
  console.log('- Main DOM check:', JSON.stringify(mainDomState, null, 2));
  if (!mainDomState.hasDesktopApi || !mainDomState.isElectron) {
    throw new Error('stellaDesktop API not properly exposed in main window');
  }
  if (mainDomState.windowType !== 'main') {
    throw new Error(`Expected windowType 'main', got '${mainDomState.windowType}'`);
  }
  if (!mainDomState.hasObservatory || mainDomState.hasOverlay) {
    throw new Error('Main window must render Observatory and NOT companion overlay');
  }

  const artifactDir = 'C:\\\\Users\\\\Sai\\\\.gemini\\\\antigravity-ide\\\\brain\\\\2fba5530-93d9-4bfb-8bd4-eec1cb8a362a';

  // Test 2B: Phase 2 Facial Expression Controller & Idle Animation Foundation
  console.log('\nTEST 2B: Phase 2 Cantarella Animation & Expression Foundation (Observatory)');
  const exprDiagnostics = await mainWindow.webContents.executeJavaScript(`
    (() => {
      const ctrl = window.__stellaAvatarController;
      if (!ctrl) return { error: 'window.__stellaAvatarController not found' };
      return ctrl.getDiagnostics();
    })()
  `);
  console.log('- Avatar Controller Diagnostics:', JSON.stringify(exprDiagnostics, null, 2));
  if (exprDiagnostics.error) {
    throw new Error(exprDiagnostics.error);
  }
  if (!exprDiagnostics.supportedExpressions.includes('happy') ||
      !exprDiagnostics.supportedExpressions.includes('sad') ||
      !exprDiagnostics.supportedExpressions.includes('angry') ||
      !exprDiagnostics.supportedExpressions.includes('playful')) {
    throw new Error('Missing expected supported expressions in controller');
  }
  const shyEntry = exprDiagnostics.unsupportedExpressions.find(e => e.name === 'shy');
  if (!shyEntry) {
    throw new Error('Shy must be reported as unsupported with clear model limitation reason');
  }
  console.log(`- Verified unsupported expression: 'shy' (${shyEntry.reason})`);

  // Test Expression Transition: Happy
  console.log('- Requesting expression: happy (duration 350ms)');
  const setHappyRes = await mainWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.setExpression('happy', { duration: 0.35 })
  `);
  console.log('- setExpression(happy) result:', JSON.stringify(setHappyRes));
  if (!setHappyRes.success) throw new Error('Failed to set happy expression');
  await sleep(450); // wait for cubic ease transition to complete

  const happyStatus = await mainWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus()
  `);
  console.log('- Happy status after transition:', JSON.stringify(happyStatus));
  if (happyStatus.currentExpression !== 'happy' || happyStatus.activeWeight < 0.99) {
    throw new Error(`Expected currentExpression 'happy' at weight 1.0, got ${JSON.stringify(happyStatus)}`);
  }

  try {
    const mainImg = await mainWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_observatory_happy.png'), mainImg.toPNG());
    console.log('- Saved screenshot: stella_observatory_happy.png');
  } catch (e) {
    console.warn('- Screenshot error:', e.message);
  }

  // Test Unsupported Expression Request: Shy
  console.log('- Requesting unsupported expression: shy');
  const setShyRes = await mainWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.setExpression('shy')
  `);
  console.log('- setExpression(shy) result:', JSON.stringify(setShyRes));
  if (setShyRes.success || setShyRes.supported) {
    throw new Error('Shy expression must be rejected with supported=false');
  }

  // Test Return to Neutral
  console.log('- Resetting to neutral');
  await mainWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.resetToNeutral(0.3)
  `);
  await sleep(500);
  const neutralStatus = await mainWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus()
  `);
  console.log('- Neutral status:', JSON.stringify(neutralStatus));
  if (neutralStatus.currentExpression !== 'neutral' || neutralStatus.activeWeight !== 0) {
    throw new Error('Failed to return smoothly to neutral');
  }

  // Test 2C: Observatory VRMA Motion Pack Controls
  console.log('\nTEST 2C: Observatory VRMA Animation-Test Controls');
  // Expand Companion Persona tab in Observatory
  await mainWindow.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.state-group-header'));
      const companionHeader = btns.find(b => b.textContent && b.textContent.includes('Companion Persona'));
      if (companionHeader && !companionHeader.classList.contains('open')) companionHeader.click();
    })()
  `);
  await sleep(400);

  const observatoryAnimCheck = await mainWindow.webContents.executeJavaScript(`
    (() => {
      const details = document.getElementById('companion-persona-details');
      const waveBtn = document.getElementById('btn-observatory-wave');
      const nodBtn = document.getElementById('btn-observatory-nod');
      const vrmaBtns = Array.from(document.querySelectorAll('.expression-btn.vrma-btn'));
      const animMgr = window.__stellaAnimationManager;
      return {
        hasPersonaDetails: Boolean(details),
        hasWaveFallback: Boolean(waveBtn),
        hasNodFallback: Boolean(nodBtn),
        vrmaButtonCount: vrmaBtns.length,
        vrmaIds: vrmaBtns.map(b => b.id),
        hasAnimManager: Boolean(animMgr),
        initialStatus: animMgr ? animMgr.getStatus() : null,
      };
    })()
  `);
  console.log('- Observatory Animation DOM Check:', JSON.stringify(observatoryAnimCheck, null, 2));
  if (!observatoryAnimCheck.hasWaveFallback || !observatoryAnimCheck.hasNodFallback) {
    throw new Error('Observatory missing fallback gesture buttons');
  }
  if (observatoryAnimCheck.vrmaButtonCount !== 8) {
    throw new Error(`Observatory expected 8 VRMA buttons, found ${observatoryAnimCheck.vrmaButtonCount}`);
  }
  if (!observatoryAnimCheck.hasAnimManager) {
    throw new Error('window.__stellaAnimationManager not exposed in Observatory window');
  }

  // Trigger VRMA_02 (Greeting) from Observatory
  console.log('- Triggering VRMA_02 (Greeting) from Observatory UI');
  await mainWindow.webContents.executeJavaScript(`
    document.getElementById('btn-observatory-vrma-vrma_02').click();
  `);
  await sleep(1500);

  const obsGreetingStatus = await mainWindow.webContents.executeJavaScript(`
    window.__stellaAnimationManager.getStatus()
  `);
  console.log('- Observatory VRMA_02 status:', JSON.stringify(obsGreetingStatus));
  if (!obsGreetingStatus.isPlaying || obsGreetingStatus.activeMotionId !== 'VRMA_02') {
    throw new Error(`Observatory VRMA_02 failed to play: ${JSON.stringify(obsGreetingStatus)}`);
  }

  try {
    const obsGreetingImg = await mainWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_observatory_vrma_greeting.png'), obsGreetingImg.toPNG());
    console.log('- Saved screenshot: stella_observatory_vrma_greeting.png');
  } catch (e) {
    console.warn('- Screenshot error:', e.message);
  }

  // Test Stop button in Observatory
  console.log('- Clicking Stop button in Observatory');
  await mainWindow.webContents.executeJavaScript(`
    (() => {
      const stopBtn = document.getElementById('btn-observatory-vrma-stop');
      if (stopBtn) stopBtn.click();
    })()
  `);
  await sleep(600);

  const obsStoppedStatus = await mainWindow.webContents.executeJavaScript(`
    window.__stellaAnimationManager.getStatus()
  `);
  console.log('- Observatory status after Stop:', JSON.stringify(obsStoppedStatus));
  if (obsStoppedStatus.isPlaying || obsStoppedStatus.activeMotionId !== null) {
    throw new Error('Observatory animation did not stop cleanly upon Stop click');
  }

  // Test 3: Activate Desktop Companion Overlay -> Verify Two-Window Mutual Exclusion
  console.log('\nTEST 3: Mode Transition -> Desktop Companion Overlay');
  const transitionToOverlayResult = await mainWindow.webContents.executeJavaScript(`
    window.stellaDesktop.openCompanionOverlay()
  `);
  console.log('- IPC openCompanionOverlay result:', JSON.stringify(transitionToOverlayResult));
  await sleep(2500); // Allow companion window creation, load, and WebGL setup

  console.log(`- Current Mode: ${currentMode}`);
  console.log(`- Main Window Visible: ${mainWindow.isVisible()} (expected: false)`);
  console.log(`- Companion Window Exists: ${Boolean(companionWindow && !companionWindow.isDestroyed())}`);
  console.log(`- Companion Window Visible: ${companionWindow?.isVisible()} (expected: true)`);
  console.log(`- Companion Window Always-on-top: ${companionWindow?.isAlwaysOnTop()} (expected: true)`);

  if (mainWindow.isVisible()) {
    throw new Error('MUTUAL EXCLUSION FAILED: Main Stella window is still visible during companion mode!');
  }
  if (!companionWindow || !companionWindow.isVisible()) {
    throw new Error('Companion window failed to display!');
  }
  if (!companionWindow.isAlwaysOnTop()) {
    throw new Error('Companion window must be always-on-top!');
  }

  // Test 4: Companion Overlay Content Verification (Character Only, No Observatory)
  console.log('\nTEST 4: Companion Window Isolated Content Check & Overlay Expression');
  const companionDomState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      return {
        hasDesktopApi: Boolean(window.stellaDesktop),
        windowType: window.stellaDesktop?.windowType,
        hasOverlay: Boolean(document.getElementById('stella-companion-overlay')),
        hasCantarella: Boolean(document.querySelector('.cantarella-avatar-root')),
        hasCanvas: Boolean(document.querySelector('.cantarella-canvas')),
        hasObservatory: Boolean(document.getElementById('observatory-root')),
        hasAstrolabe: Boolean(document.getElementById('astro')),
        hasUniverse: Boolean(document.querySelector('.universe-view-root')),
        bodyClass: document.body.className,
      };
    })()
  `);
  console.log('- Companion DOM check:', JSON.stringify(companionDomState, null, 2));

  if (!companionDomState.hasOverlay || !companionDomState.hasCantarella) {
    throw new Error('Companion window MUST contain companion overlay and Cantarella avatar');
  }
  if (companionDomState.hasObservatory || companionDomState.hasAstrolabe || companionDomState.hasUniverse) {
    throw new Error('Companion window contains Observatory or Universe UI! Must display ONLY Cantarella!');
  }
  if (!companionDomState.bodyClass.includes('companion-overlay-active')) {
    throw new Error('Companion window body must have companion-overlay-active class for transparent canvas');
  }

  // Test 4B: Manual Reaction Drawer in Desktop Companion Overlay
  console.log('\nTEST 4B: Manual Companion Reactions (Tray, Buttons, Gestures, Keyboard)');
  
  // Verify toggle button exists and tray is initially closed
  const initialTrayState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      return {
        hasToggleBtn: Boolean(document.getElementById('btn-companion-reactions-toggle')),
        isTrayOpen: Boolean(document.getElementById('companion-reactions-tray')),
      };
    })()
  `);
  console.log('- Initial overlay reaction state:', JSON.stringify(initialTrayState));
  if (!initialTrayState.hasToggleBtn) throw new Error('Missing reaction toggle button');
  if (initialTrayState.isTrayOpen) throw new Error('Reaction tray should be closed by default');

  // Open reaction drawer
  console.log('- Clicking reaction toggle button to open drawer');
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('btn-companion-reactions-toggle').click();
  `);
  await sleep(300);

  const openedTrayState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const tray = document.getElementById('companion-reactions-tray');
      return {
        isTrayOpen: Boolean(tray),
        hasNeutral: Boolean(document.getElementById('reaction-btn-neutral')),
        hasHappy: Boolean(document.getElementById('reaction-btn-happy')),
        hasSad: Boolean(document.getElementById('reaction-btn-sad')),
        hasAngry: Boolean(document.getElementById('reaction-btn-angry')),
        hasPlayful: Boolean(document.getElementById('reaction-btn-playful')),
        hasShy: Boolean(document.getElementById('reaction-btn-shy')),
        hasWave: Boolean(document.getElementById('reaction-btn-wave')),
        hasNod: Boolean(document.getElementById('reaction-btn-nod')),
      };
    })()
  `);
  console.log('- Opened reaction drawer state:', JSON.stringify(openedTrayState, null, 2));
  if (!openedTrayState.isTrayOpen) throw new Error('Reaction drawer failed to open');
  if (!openedTrayState.hasNeutral || !openedTrayState.hasHappy || !openedTrayState.hasSad ||
      !openedTrayState.hasAngry || !openedTrayState.hasPlayful) {
    throw new Error('Reaction drawer is missing one or more supported expression buttons');
  }
  if (openedTrayState.hasShy) {
    throw new Error('Shy button must NOT be present in overlay UI (unsupported by model)');
  }
  if (!openedTrayState.hasWave || !openedTrayState.hasNod) {
    throw new Error('Missing gesture buttons in reaction drawer');
  }

  // Click Happy button
  console.log('- Triggering Happy expression from reaction tray');
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-happy').click();
  `);
  await sleep(450);

  const happyOverlayStatus = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus()
  `);
  console.log('- Happy status from tray:', JSON.stringify(happyOverlayStatus));
  if (happyOverlayStatus.currentExpression !== 'happy') {
    throw new Error(`Expected 'happy', got ${happyOverlayStatus.currentExpression}`);
  }

  try {
    const compImg = await companionWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_companion_reactions_happy.png'), compImg.toPNG());
    console.log('- Saved screenshot: stella_companion_reactions_happy.png');
  } catch (e) {
    console.warn('- Screenshot error:', e.message);
  }

  // Click Sad button
  console.log('- Triggering Sad expression from reaction tray');
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-sad').click();
  `);
  await sleep(450);
  const sadOverlayStatus = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus()
  `);
  console.log('- Sad status from tray:', JSON.stringify(sadOverlayStatus));
  if (sadOverlayStatus.currentExpression !== 'sad') {
    throw new Error(`Expected 'sad', got ${sadOverlayStatus.currentExpression}`);
  }

  // Click Angry button
  console.log('- Triggering Angry expression from reaction tray');
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-angry').click();
  `);
  await sleep(450);
  const angryOverlayStatus = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus()
  `);
  console.log('- Angry status from tray:', JSON.stringify(angryOverlayStatus));
  if (angryOverlayStatus.currentExpression !== 'angry') {
    throw new Error(`Expected 'angry', got ${angryOverlayStatus.currentExpression}`);
  }

  // Click Playful button
  console.log('- Triggering Playful expression from reaction tray');
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-playful').click();
  `);
  await sleep(450);
  const playfulOverlayStatus = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus()
  `);
  console.log('- Playful status from tray:', JSON.stringify(playfulOverlayStatus));
  if (playfulOverlayStatus.currentExpression !== 'playful') {
    throw new Error(`Expected 'playful', got ${playfulOverlayStatus.currentExpression}`);
  }

  // Diagnostic: Inspect normalized humanoid bone positions
  const bonesInfo = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const vrm = window.__stellaAvatarController?.getVRM();
      if (!vrm) return { error: 'no vrm' };
      const getPos = (name) => {
        const b = vrm.humanoid?.getNormalizedBoneNode(name);
        if (!b) return null;
        b.updateWorldMatrix(true, false);
        const m = b.matrixWorld.elements;
        return { x: +m[12].toFixed(3), y: +m[13].toFixed(3), z: +m[14].toFixed(3) };
      };
      return {
        head: getPos('head'),
        neck: getPos('neck'),
        chest: getPos('chest'),
        rightShoulder: getPos('rightShoulder'),
        rightUpperArm: getPos('rightUpperArm'),
        rightLowerArm: getPos('rightLowerArm'),
        rightHand: getPos('rightHand'),
      };
    })()
  `);
  console.log('- Rest bone positions:', JSON.stringify(bonesInfo, null, 2));

  // Test Wave Gesture individually
  console.log('\n- Testing Wave gesture individually:');
  const exprBeforeWave = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus().currentExpression
  `);
  console.log(`  * Expression before wave: ${exprBeforeWave}`);

  // Trigger Wave
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-wave').click();
  `);
  console.log('  * Triggered Wave gesture');
  await sleep(1000); // Wait for arm lift into waving phase (~1.0s into 2.4s gesture)

  // Verify Wave active state and bone positions
  const waveActiveState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const vrm = window.__stellaAvatarController?.getVRM();
      const idle = window.__stellaIdleController;
      const lower = vrm?.humanoid?.getNormalizedBoneNode('rightLowerArm');
      const hand = vrm?.humanoid?.getNormalizedBoneNode('rightHand');
      const mE = lower ? lower.matrixWorld.elements : [];
      const mH = hand ? hand.matrixWorld.elements : [];
      return {
        isGesturePlaying: idle?.isGesturePlaying() ?? false,
        activeGesture: idle?.getActiveGesture(),
        elbowY: mE[13] ? +mE[13].toFixed(3) : 0,
        handY: mH[13] ? +mH[13].toFixed(3) : 0,
        handX: mH[12] ? +mH[12].toFixed(3) : 0,
        expression: window.__stellaAvatarController.getStatus().currentExpression,
      };
    })()
  `);
  console.log('  * Mid-wave state:', JSON.stringify(waveActiveState));
  if (waveActiveState.handY < 1.25) {
    throw new Error(`Wave gesture failed: Hand height ${waveActiveState.handY} is too low (expected >= 1.25 near head)`);
  }
  if (waveActiveState.expression !== exprBeforeWave) {
    throw new Error(`Wave corrupted active expression: was ${exprBeforeWave}, became ${waveActiveState.expression}`);
  }

  try {
    const waveActiveImg = await companionWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_companion_wave_active.png'), waveActiveImg.toPNG());
    console.log('  * Saved screenshot: stella_companion_wave_active.png');
  } catch (e) {
    console.warn('  * Screenshot error:', e.message);
  }

  // Wait for wave gesture to complete and return to rest (total 2.4s, wait 1.6s more)
  await sleep(1600);

  const waveRestoredState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const vrm = window.__stellaAvatarController?.getVRM();
      const idle = window.__stellaIdleController;
      const upper = vrm?.humanoid?.getNormalizedBoneNode('rightUpperArm');
      const lower = vrm?.humanoid?.getNormalizedBoneNode('rightLowerArm');
      const hand = vrm?.humanoid?.getNormalizedBoneNode('rightHand');
      return {
        isGesturePlaying: idle?.isGesturePlaying() ?? false,
        upperRot: { x: +upper.rotation.x.toFixed(3), y: +upper.rotation.y.toFixed(3), z: +upper.rotation.z.toFixed(3) },
        lowerRot: { x: +lower.rotation.x.toFixed(3), y: +lower.rotation.y.toFixed(3), z: +lower.rotation.z.toFixed(3) },
        handRot: { x: +hand.rotation.x.toFixed(3), y: +hand.rotation.y.toFixed(3), z: +hand.rotation.z.toFixed(3) },
        expression: window.__stellaAvatarController.getStatus().currentExpression,
      };
    })()
  `);
  console.log('  * Wave restored state:', JSON.stringify(waveRestoredState));
  if (waveRestoredState.isGesturePlaying) {
    throw new Error('Wave gesture did not end on time');
  }
  if (Math.abs(waveRestoredState.upperRot.z - (-1.25)) > 0.05) {
    throw new Error(`Upper arm failed to restore exact rest Z=-1.25: got ${waveRestoredState.upperRot.z}`);
  }
  if (Math.abs(waveRestoredState.handRot.z) > 0.05) {
    throw new Error(`Hand rotation failed to restore to 0: got ${waveRestoredState.handRot.z}`);
  }

  try {
    const waveRestoredImg = await companionWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_companion_wave_restored.png'), waveRestoredImg.toPNG());
    console.log('  * Saved screenshot: stella_companion_wave_restored.png');
  } catch (e) {
    console.warn('  * Screenshot error:', e.message);
  }

  // Test Nod Gesture individually with expression preservation
  console.log('\n- Testing Nod gesture individually (verifying expression preservation):');
  // Set expression to 'sad' to strictly prove Nod preserves non-happy expressions
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-sad').click();
  `);
  await sleep(400);

  const exprBeforeNod = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus().currentExpression
  `);
  console.log(`  * Expression before nod: ${exprBeforeNod} (expected: sad)`);

  // Trigger Nod
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-nod').click();
  `);
  console.log('  * Triggered Nod gesture');
  await sleep(550); // Mid-nod peak tilt (~0.55s into 1.1s gesture)

  const nodMidState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const vrm = window.__stellaAvatarController?.getVRM();
      const idle = window.__stellaIdleController;
      const head = vrm?.humanoid?.getNormalizedBoneNode('head');
      return {
        isGesturePlaying: idle?.isGesturePlaying() ?? false,
        headPitch: head ? +head.rotation.x.toFixed(3) : 0,
        expression: window.__stellaAvatarController.getStatus().currentExpression,
      };
    })()
  `);
  console.log('  * Mid-nod state:', JSON.stringify(nodMidState));
  if (nodMidState.expression !== 'sad') {
    throw new Error(`CRITICAL BUG: Nod altered active expression! Was 'sad', became '${nodMidState.expression}'`);
  }
  if (nodMidState.headPitch < 0.06) {
    throw new Error(`Nod failed to tilt head downward: pitch was ${nodMidState.headPitch}`);
  }

  try {
    const nodActiveImg = await companionWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_companion_nod_active.png'), nodActiveImg.toPNG());
    console.log('  * Saved screenshot: stella_companion_nod_active.png');
  } catch (e) {
    console.warn('  * Screenshot error:', e.message);
  }

  // Wait for nod to complete and return smoothly to idle
  await sleep(700);

  const nodRestoredState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const idle = window.__stellaIdleController;
      return {
        isGesturePlaying: idle?.isGesturePlaying() ?? false,
        expression: window.__stellaAvatarController.getStatus().currentExpression,
      };
    })()
  `);
  console.log('  * Nod restored state:', JSON.stringify(nodRestoredState));
  if (nodRestoredState.isGesturePlaying) {
    throw new Error('Nod gesture did not end on time');
  }
  if (nodRestoredState.expression !== 'sad') {
    throw new Error(`Nod failed to preserve expression after finish: expected 'sad', got ${nodRestoredState.expression}`);
  }

  try {
    const nodRestoredImg = await companionWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_companion_nod_restored.png'), nodRestoredImg.toPNG());
    console.log('  * Saved screenshot: stella_companion_nod_restored.png');
  } catch (e) {
    console.warn('  * Screenshot error:', e.message);
  }

  // Test Mutual Exclusion of Gestures (preventing overlapping gesture corruption)
  console.log('\n- Testing gesture mutual exclusion:');
  const overlapTest = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const idle = window.__stellaIdleController;
      const startedWave = idle.playGesture('wave');
      const startedNodWhileWave = idle.playGesture('nod');
      return { startedWave, startedNodWhileWave };
    })()
  `);
  console.log('  * Overlap test result:', JSON.stringify(overlapTest));
  if (overlapTest.startedNodWhileWave) {
    throw new Error('Overlapping gesture was not rejected! Bone corruption risk!');
  }
  // Let wave finish
  await sleep(2500);

  // Click Neutral button (smooth return to baseline neutral)
  console.log('\n- Clicking Neutral button to reset expression');
  await companionWindow.webContents.executeJavaScript(`
    document.getElementById('reaction-btn-neutral').click();
  `);
  await sleep(500);
  const resetOverlayStatus = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAvatarController.getStatus()
  `);
  console.log('- Reset status from tray:', JSON.stringify(resetOverlayStatus));
  if (resetOverlayStatus.currentExpression !== 'neutral' || resetOverlayStatus.activeWeight !== 0) {
    throw new Error('Failed to reset to neutral from reaction tray');
  }

  // Test 4C: Full Verification of All 8 VRoid Project VRMA Animations
  console.log('\nTEST 4C: VRoid Project VRMA Motion Pack Verification (All 8 Animations on Cantarella)');

  // Verify all 8 test buttons in companion reaction tray
  const overlayMotionTestCheck = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const vrmaBtns = Array.from(document.querySelectorAll('.reaction-pill-btn.vrma-pill'));
      const animMgr = window.__stellaAnimationManager;
      return {
        vrmaButtonCount: vrmaBtns.length,
        vrmaIds: vrmaBtns.map(b => b.id),
        hasAnimManager: Boolean(animMgr),
        initialStatus: animMgr ? animMgr.getStatus() : null,
      };
    })()
  `);
  console.log('- Overlay Animation Controls Check:', JSON.stringify(overlayMotionTestCheck, null, 2));
  if (overlayMotionTestCheck.vrmaButtonCount !== 8) {
    throw new Error(`Expected 8 VRMA buttons in companion tray, found ${overlayMotionTestCheck.vrmaButtonCount}`);
  }

  const vrmaTestList = [
    { id: 'VRMA_01', name: 'Show Full Body', file: 'VRMA_01.vrma', expDuration: 7.8, waitMs: 1400 },
    { id: 'VRMA_02', name: 'Greeting', file: 'VRMA_02.vrma', expDuration: 4.8, waitMs: 1200 },
    { id: 'VRMA_03', name: 'Peace Sign', file: 'VRMA_03.vrma', expDuration: 7.7, waitMs: 1400 },
    { id: 'VRMA_04', name: 'Shoot', file: 'VRMA_04.vrma', expDuration: 6.3, waitMs: 1300 },
    { id: 'VRMA_05', name: 'Spin', file: 'VRMA_05.vrma', expDuration: 3.6, waitMs: 1200 },
    { id: 'VRMA_06', name: 'Model Pose', file: 'VRMA_06.vrma', expDuration: 2.9, waitMs: 1200 },
    { id: 'VRMA_07', name: 'Squat', file: 'VRMA_07.vrma', expDuration: 4.4, waitMs: 1300 },
    { id: 'VRMA_EXTRA', name: 'Arm Flailing', file: 'うでぶんぶん.vrma', expDuration: 1.1, waitMs: 400 },
  ];

  for (const motion of vrmaTestList) {
    console.log(`\n  * Testing [${motion.id}] ${motion.name} (${motion.file})`);
    
    // Trigger motion
    await companionWindow.webContents.executeJavaScript(`
      document.getElementById('reaction-btn-${motion.id.toLowerCase()}').click();
    `);
    
    await sleep(motion.waitMs);

    // Verify active animation status and bone motion
    const motionState = await companionWindow.webContents.executeJavaScript(`
      (() => {
        const mgr = window.__stellaAnimationManager;
        const vrm = window.__stellaAvatarController?.getVRM();
        const upperR = vrm?.humanoid?.getNormalizedBoneNode('rightUpperArm');
        const upperL = vrm?.humanoid?.getNormalizedBoneNode('leftUpperArm');
        const hips = vrm?.humanoid?.getNormalizedBoneNode('hips');
        const head = vrm?.humanoid?.getNormalizedBoneNode('head');
        
        return {
          status: mgr ? mgr.getStatus() : null,
          armR_Rot: upperR ? { x: +upperR.rotation.x.toFixed(3), y: +upperR.rotation.y.toFixed(3), z: +upperR.rotation.z.toFixed(3) } : null,
          armL_Rot: upperL ? { x: +upperL.rotation.x.toFixed(3), y: +upperL.rotation.y.toFixed(3), z: +upperL.rotation.z.toFixed(3) } : null,
          hipsPos: hips ? { x: +hips.position.x.toFixed(3), y: +hips.position.y.toFixed(3), z: +hips.position.z.toFixed(3) } : null,
          headRot: head ? { x: +head.rotation.x.toFixed(3), y: +head.rotation.y.toFixed(3), z: +head.rotation.z.toFixed(3) } : null,
          expression: window.__stellaAvatarController?.getStatus().currentExpression,
        };
      })()
    `);
    console.log(`    Status:`, JSON.stringify(motionState.status));
    console.log(`    Rig pose: R-Arm ${JSON.stringify(motionState.armR_Rot)}, Hips ${JSON.stringify(motionState.hipsPos)}, Expr ${motionState.expression}`);

    if (!motionState.status || !motionState.status.isPlaying || motionState.status.activeMotionId !== motion.id) {
      throw new Error(`Failed to play ${motion.id}: ${JSON.stringify(motionState.status)}`);
    }

    // Capture screenshot
    try {
      const clipImg = await companionWindow.webContents.capturePage();
      const fileName = `stella_companion_${motion.id.toLowerCase()}.png`;
      fs.writeFileSync(path.join(artifactDir, fileName), clipImg.toPNG());
      console.log(`    Saved screenshot: ${fileName}`);
    } catch (e) {
      console.warn(`    Screenshot error:`, e.message);
    }
  }

  // Test Mutual Exclusion between Imported Motions and Hand Gestures
  console.log('\n- Testing conflict prevention between imported motion and manual gestures:');
  const conflictCheck = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const mgr = window.__stellaAnimationManager;
      const ctrl = window.__stellaAvatarController;
      // An imported motion is currently playing; attempt to trigger manual wave
      const waveRes = ctrl.playGesture('wave');
      return {
        isMotionPlaying: mgr.isPlaying(),
        manualWaveAccepted: waveRes,
      };
    })()
  `);
  console.log('  * Conflict prevention check:', JSON.stringify(conflictCheck));
  if (conflictCheck.manualWaveAccepted) {
    throw new Error('Manual gesture was accepted while imported motion is playing! Bone conflict guard failed!');
  }

  // Test Stop button in Companion Overlay
  console.log('\n- Testing Stop button in Companion Overlay');
  await companionWindow.webContents.executeJavaScript(`
    (() => {
      const stopBtn = document.getElementById('btn-vrma-stop');
      if (stopBtn) stopBtn.click();
    })()
  `);
  await sleep(600);

  const postStopStatus = await companionWindow.webContents.executeJavaScript(`
    window.__stellaAnimationManager.getStatus()
  `);
  console.log('- Companion status after Stop:', JSON.stringify(postStopStatus));
  if (postStopStatus.isPlaying || postStopStatus.activeMotionId !== null) {
    throw new Error('Companion motion did not stop cleanly upon Stop click');
  }

  // Verify smooth return to Cantarella's normalized rest A-pose
  console.log('- Verifying restoration to Cantarella resting A-pose');
  await sleep(500);
  const finalRestState = await companionWindow.webContents.executeJavaScript(`
    (() => {
      const vrm = window.__stellaAvatarController?.getVRM();
      const upperR = vrm?.humanoid?.getNormalizedBoneNode('rightUpperArm');
      const upperL = vrm?.humanoid?.getNormalizedBoneNode('leftUpperArm');
      const hips = vrm?.humanoid?.getNormalizedBoneNode('hips');
      return {
        armR_Z: upperR ? +upperR.rotation.z.toFixed(2) : 0,
        armL_Z: upperL ? +upperL.rotation.z.toFixed(2) : 0,
        hips_Y: hips ? +hips.position.y.toFixed(2) : 0,
      };
    })()
  `);
  console.log('- Final Rest State:', JSON.stringify(finalRestState));
  if (Math.abs(finalRestState.armR_Z - (-1.25)) > 0.1 || Math.abs(finalRestState.armL_Z - (1.25)) > 0.1) {
    throw new Error(`Arms did not smoothly restore to Cantarella resting A-pose (-1.25, 1.25): ${JSON.stringify(finalRestState)}`);
  }

  // Test Keyboard Accessibility: Escape key closes the tray
  console.log('- Testing Escape key to close reaction tray');
  await companionWindow.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
  `);
  await sleep(300);

  const closedTrayState = await companionWindow.webContents.executeJavaScript(`
    Boolean(document.getElementById('companion-reactions-tray'))
  `);
  console.log('- Tray open after Escape:', closedTrayState);
  if (closedTrayState) {
    throw new Error('Reaction drawer should close when Escape key is pressed');
  }

  try {
    const compClosedImg = await companionWindow.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'stella_companion_clean_neutral.png'), compClosedImg.toPNG());
    console.log('- Saved screenshot: stella_companion_clean_neutral.png');
  } catch (e) {
    console.warn('- Screenshot error:', e.message);
  }

  // Test 5: Return to Stella -> Mutual Exclusion & Window Restoration
  console.log('\nTEST 5: Return to Stella (Workspace Restoration)');
  const returnResult = await companionWindow.webContents.executeJavaScript(`
    window.stellaDesktop.returnToWorkspace()
  `);
  console.log('- Return result:', JSON.stringify(returnResult));
  await sleep(1500);

  console.log(`- Current Mode: ${currentMode}`);
  console.log(`- Main Window Visible: ${mainWindow.isVisible()} (expected: true)`);
  console.log(`- Companion Window Visible: ${companionWindow?.isVisible()} (expected: false)`);

  if (!mainWindow.isVisible()) {
    throw new Error('Main window was not restored upon return to Stella!');
  }
  if (companionWindow?.isVisible()) {
    throw new Error('MUTUAL EXCLUSION FAILED: Companion overlay is still visible after returning to workspace!');
  }

  const restoredMainDomState = await mainWindow.webContents.executeJavaScript(`
    (() => {
      return {
        hasObservatory: Boolean(document.getElementById('observatory-root')),
        hasOverlay: Boolean(document.getElementById('stella-companion-overlay')),
      };
    })()
  `);
  console.log('- Restored Main DOM check:', JSON.stringify(restoredMainDomState));
  if (!restoredMainDomState.hasObservatory || restoredMainDomState.hasOverlay) {
    throw new Error('Main window state corrupted after returning from companion');
  }

  // Test 6: Rapid Toggling Safety
  console.log('\nTEST 6: Rapid Repeated Toggling Stability');
  await mainWindow.webContents.executeJavaScript(`window.stellaDesktop.openCompanionOverlay()`);
  await mainWindow.webContents.executeJavaScript(`window.stellaDesktop.openCompanionOverlay()`);
  await sleep(800);
  await companionWindow.webContents.executeJavaScript(`window.stellaDesktop.returnToWorkspace()`);
  await companionWindow.webContents.executeJavaScript(`window.stellaDesktop.returnToWorkspace()`);
  await sleep(1000);

  console.log(`- Mode after rapid toggles: ${currentMode}`);
  console.log(`- Main Window Alive: ${!mainWindow.isDestroyed() && mainWindow.isVisible()}`);
  console.log(`- Companion Window Hidden: ${!companionWindow.isVisible()}`);
  if (!mainWindow.isVisible() || companionWindow.isVisible()) {
    throw new Error('Rapid toggling corrupted window visibility states');
  }

  // Test 7: Preload Security Validation
  console.log('\nTEST 7: Preload Security Validation');
  const invalidCall = await mainWindow.webContents.executeJavaScript(`
    window.stellaDesktop.setPresentationMode('malicious-mode')
      .then(() => false)
      .catch(() => true)
  `);
  console.log(`- Invalid mode rejected: ${invalidCall} (expected: true)`);
  if (!invalidCall) {
    throw new Error('Security check failed: invalid presentation mode was not rejected');
  }

  console.log('\n======================================================');
  console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  console.log('======================================================\n');

  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.destroy();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  app.quit();
  process.exit(0);
}
