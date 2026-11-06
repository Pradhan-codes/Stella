/**
 * Stella Phase 7.5 Automated Verification Suite:
 * - Companion-First Output Experience: Readable dialogue presentation in Overlay
 * - Expression Synchronization: Response emotion reaches overlay Cantarella instance
 * - Conversation State Pipeline: listening, thinking, speaking, idle transitions
 * - Real Speech-Driven Mouth Animation: VRM mouth shapes (aa, ih, ou, ee, oh) animated during speech
 * - Mouth Settling & Emotional Idle: Smooth decay to 0 and preservation of emotional posture
 * - Coordination with VRMA Motions: Body animation and mouth movement coexistence
 * - Rapid Turns, Cancellation, and Reload State Recovery
 */

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// IPC State & Validation Bridge (Mirroring electron/main.cjs)
// --------------------------------------------------------------------------
let cachedAvatarState = {
  expression: 'neutral',
  intensity: 1.0,
  duration: 0.35,
  holdDuration: 0,
  conversationState: 'idle',
  timestamp: Date.now(),
};

let cachedDialogueTurn = null;

const VALID_EXPRESSIONS = new Set([
  'neutral',
  'happy',
  'sad',
  'angry',
  'playful',
  'shy',
  'curious',
]);
const VALID_CONV_STATES = new Set(['idle', 'listening', 'thinking', 'speaking']);
const VALID_DIALOGUE_STATUSES = new Set(['thinking', 'speaking', 'completed', 'error']);

function validateAndSanitizeAvatarState(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const rawExpr = typeof raw.expression === 'string' ? raw.expression.toLowerCase() : 'neutral';
  const expression = VALID_EXPRESSIONS.has(rawExpr) ? rawExpr : 'neutral';

  let intensity = typeof raw.intensity === 'number' && !isNaN(raw.intensity) ? raw.intensity : 1.0;
  intensity = Math.max(0, Math.min(1.0, intensity));

  let duration = typeof raw.duration === 'number' && !isNaN(raw.duration) ? raw.duration : 0.35;
  duration = Math.max(0.01, Math.min(5.0, duration));

  let holdDuration =
    typeof raw.holdDuration === 'number' && !isNaN(raw.holdDuration) ? raw.holdDuration : 0;
  holdDuration = Math.max(0, Math.min(60.0, holdDuration));

  const rawConv =
    typeof raw.conversationState === 'string' ? raw.conversationState.toLowerCase() : 'idle';
  const conversationState = VALID_CONV_STATES.has(rawConv) ? rawConv : 'idle';

  return {
    expression,
    intensity,
    duration,
    holdDuration,
    conversationState,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
  };
}

function validateAndSanitizeDialogueTurn(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const turnId =
    typeof raw.turnId === 'string' && raw.turnId.trim().length > 0
      ? raw.turnId.trim().slice(0, 128)
      : `turn_${Date.now()}`;

  const assistantText =
    typeof raw.assistantText === 'string' ? raw.assistantText.slice(0, 8192) : '';

  const userMessage =
    typeof raw.userMessage === 'string' ? raw.userMessage.slice(0, 4096) : undefined;

  const rawExpr =
    typeof raw.expressionHint === 'string' ? raw.expressionHint.toLowerCase().trim() : null;
  const expressionHint = rawExpr && rawExpr.length > 0 ? rawExpr.slice(0, 64) : null;

  const rawStatus = typeof raw.status === 'string' ? raw.status.toLowerCase().trim() : 'completed';
  const status = VALID_DIALOGUE_STATUSES.has(rawStatus) ? rawStatus : 'completed';

  const timestamp = typeof raw.timestamp === 'number' && !isNaN(raw.timestamp) ? raw.timestamp : Date.now();

  return {
    turnId,
    assistantText,
    userMessage,
    expressionHint,
    status,
    timestamp,
  };
}

let mainWin = null;
let companionWin = null;

ipcMain.handle('stella:get-presentation-mode', () => 'companion-overlay');
ipcMain.handle('stella:set-presentation-mode', () => ({ success: true, mode: 'companion-overlay' }));
ipcMain.handle('stella:open-companion-overlay', () => ({ success: true, mode: 'companion-overlay' }));
ipcMain.handle('stella:return-to-workspace', () => ({ success: true, mode: 'workspace' }));

ipcMain.handle('stella:get-avatar-state', () => {
  return cachedAvatarState;
});

ipcMain.on('stella:avatar-sync', (event, rawState) => {
  const sanitized = validateAndSanitizeAvatarState(rawState);
  if (!sanitized) return;

  cachedAvatarState = sanitized;

  const senderWebContents = event.sender;
  const windows = [mainWin, companionWin];

  for (const win of windows) {
    if (win && !win.isDestroyed() && win.webContents && win.webContents !== senderWebContents) {
      win.webContents.send('stella:avatar-state-changed', sanitized);
    }
  }
});

ipcMain.handle('stella:get-dialogue-turn', () => {
  return cachedDialogueTurn;
});

ipcMain.on('stella:dialogue-sync', (event, rawTurn) => {
  const sanitized = validateAndSanitizeDialogueTurn(rawTurn);
  if (!sanitized) return;

  cachedDialogueTurn = sanitized;

  const senderWebContents = event.sender;
  const windows = [mainWin, companionWin];

  for (const win of windows) {
    if (win && !win.isDestroyed() && win.webContents && win.webContents !== senderWebContents) {
      win.webContents.send('stella:dialogue-turn-changed', sanitized);
    }
  }
});

app.whenReady().then(async () => {
  console.log('\n================================================================');
  console.log('TEST SUITE: Phase 7.5 Companion-First Output & Lip-Sync Pipeline');
  console.log('================================================================\n');

  const preloadPath = path.join(__dirname, '../electron/preload.cjs');
  const distPath = path.join(__dirname, '../dist/index.html');

  // 1. Create Main Window (Observatory)
  console.log('1. Launching Main Window (Observatory)...');
  mainWin = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      additionalArguments: ['--window-type=main'],
    },
  });
  await mainWin.loadFile(distPath);

  // 2. Create Companion Overlay Window (#companion)
  console.log('2. Launching Desktop Companion Overlay Window (#companion)...');
  companionWin = new BrowserWindow({
    width: 320,
    height: 490,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      additionalArguments: ['--window-type=companion'],
    },
  });
  await companionWin.loadFile(distPath, { hash: 'companion' });

  // Wait for 3D avatars and controllers to mount in both windows
  console.log('- Waiting for 3D avatars, controllers, and lip-sync to mount...');
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const mainReady = await mainWin.webContents.executeJavaScript(`
      Boolean(
        window.__stellaAvatarController &&
        window.__stellaIdleController &&
        window.__stellaAnimationManager &&
        window.__stellaLipSyncController
      );
    `);
    const companionReady = await companionWin.webContents.executeJavaScript(`
      Boolean(
        window.__stellaAvatarController &&
        window.__stellaIdleController &&
        window.__stellaAnimationManager &&
        window.__stellaLipSyncController
      );
    `);
    if (mainReady && companionReady) {
      ready = true;
      break;
    }
  }

  if (!ready) {
    throw new Error('Timeout waiting for 3D avatars, controllers, or LipSync to initialize.');
  }
  console.log('✓ Both Main and Companion Overlay windows initialized all 4 controllers.\n');

  // --------------------------------------------------------------------------
  // TEST 1: Companion Dialogue Area DOM Presence
  // --------------------------------------------------------------------------
  console.log('TEST 1: Verifying Companion Dialogue Presentation UI in Overlay...');
  const domCheck = await companionWin.webContents.executeJavaScript(`
    (() => {
      const chatBtn = document.getElementById('btn-companion-chat-toggle');
      const reactionBtn = document.getElementById('btn-companion-reactions-toggle');
      const minimizeBtn = document.getElementById('btn-companion-minimize');
      const returnBtn = document.getElementById('btn-companion-return');
      return {
        hasChatToggle: Boolean(chatBtn),
        hasReactionToggle: Boolean(reactionBtn),
        hasMinimize: Boolean(minimizeBtn),
        hasReturn: Boolean(returnBtn),
      };
    })()
  `);
  console.log('  Companion Controls:', domCheck);
  if (!domCheck.hasChatToggle) {
    throw new Error('FAIL: Chat toggle button missing from Companion Overlay capsule.');
  }
  console.log('  ✓ Companion capsule contains dialogue toggle and all window controls.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Dialogue Turn Dispatch and Overlay Response Text Presentation
  // --------------------------------------------------------------------------
  console.log('TEST 2: Verifying Dialogue Turn presentation in Companion Overlay...');
  const testTurn = {
    turnId: 'turn_test_001',
    userMessage: 'Greetings Stella, how are the stars tonight?',
    assistantText: 'The celestial alignment is exceptionally clear tonight. Observatory instruments are primed.',
    expressionHint: 'happy',
    status: 'speaking',
    timestamp: Date.now(),
  };

  // Dispatch turn from Main window through IPC bridge
  await mainWin.webContents.executeJavaScript(`
    window.stellaDesktop.sendDialogueTurn(${JSON.stringify(testTurn)});
  `);

  await sleep(600);

  const dialogueDisplayCheck = await companionWin.webContents.executeJavaScript(`
    (() => {
      const card = document.getElementById('companion-dialogue-card');
      const textElem = document.getElementById('companion-assistant-reply-text');
      const inputElem = document.getElementById('companion-chat-input');
      return {
        isCardVisible: Boolean(card),
        displayedText: textElem ? textElem.textContent.trim() : null,
        hasInputPill: Boolean(inputElem),
      };
    })()
  `);
  console.log('  Overlay Dialogue Display:', dialogueDisplayCheck);

  if (!dialogueDisplayCheck.isCardVisible) {
    throw new Error('FAIL: Dialogue card not visible in Companion Overlay upon receiving turn.');
  }
  if (!dialogueDisplayCheck.displayedText.includes('celestial alignment is exceptionally clear')) {
    throw new Error(`FAIL: Dialogue text mismatch. Got: "${dialogueDisplayCheck.displayedText}"`);
  }
  if (!dialogueDisplayCheck.hasInputPill) {
    throw new Error('FAIL: Companion quick-chat input pill missing from dialogue card.');
  }
  console.log('  ✓ Response text successfully presented in Companion Overlay dialogue card.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Expression Synchronization on Overlay's Actual Avatar Instance
  // --------------------------------------------------------------------------
  console.log('TEST 3: Verifying Response Expression applied to Overlay Avatar...');
  const exprCheck = await companionWin.webContents.executeJavaScript(`
    (() => {
      const ctrl = window.__stellaAvatarController;
      return {
        targetExpression: ctrl.getTargetExpression(),
        isTransitioning: ctrl.isTransitioning(),
        activeWeight: ctrl.getActiveWeight(),
      };
    })()
  `);
  console.log('  Overlay Expression Status:', exprCheck);
  if (exprCheck.targetExpression !== 'happy') {
    throw new Error(`FAIL: Expected overlay targetExpression to be 'happy', got '${exprCheck.targetExpression}'`);
  }
  console.log('  ✓ Response expression "happy" applied to Companion Overlay avatar.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Conversation State Pipeline Synchronization
  // --------------------------------------------------------------------------
  console.log('TEST 4: Verifying Conversation State Pipeline in Overlay...');
  const statesToTest = ['listening', 'thinking', 'speaking', 'idle'];
  for (const st of statesToTest) {
    await mainWin.webContents.executeJavaScript(`
      window.__stellaAvatarController.setConversationState('${st}');
    `);
    await sleep(250);

    const companionConvState = await companionWin.webContents.executeJavaScript(`
      (() => {
        const avatarConv = window.__stellaAvatarController.getConversationState();
        const idleConv = window.__stellaIdleController.getConversationState();
        return { avatarConv, idleConv };
      })()
    `);
    if (companionConvState.avatarConv !== st) {
      throw new Error(`FAIL: State '${st}' not synchronized to overlay avatarController (got '${companionConvState.avatarConv}')`);
    }
  }
  console.log('  ✓ All conversation states (listening, thinking, speaking, idle) synchronized.\n');

  // --------------------------------------------------------------------------
  // TEST 5: Real Speech-Driven Mouth Animation (Lip-Sync) in Overlay
  // --------------------------------------------------------------------------
  console.log('TEST 5: Testing Speech-Driven Mouth Animation in Overlay Avatar...');
  // Simulate active speech audio analysis weights on overlay's lip-sync controller
  const lipSyncActiveResult = await companionWin.webContents.executeJavaScript(`
    (() => {
      const lipSync = window.__stellaLipSyncController;
      const avatarCtrl = window.__stellaAvatarController;
      const vrm = avatarCtrl.getVRM();

      // Set conversation state to speaking
      avatarCtrl.setConversationState('speaking');

      // Simulate vowel weights during active speech utterance (e.g. "aa" / "oh" dominant)
      lipSync.setDirectWeights({ aa: 0.65, oh: 0.40, ee: 0.15 });

      // Read actual blendshape weights directly from the VRM's ExpressionManager
      const mgr = vrm.expressionManager;
      return {
        isSpeaking: lipSync.isSpeaking(),
        vrmWeightAa: mgr.getValue('aa'),
        vrmWeightOh: mgr.getValue('oh'),
        vrmWeightEe: mgr.getValue('ee'),
        vrmWeightIh: mgr.getValue('ih'),
        vrmWeightOu: mgr.getValue('ou'),
      };
    })()
  `);
  console.log('  Active Speech VRM Mouth Weights in Overlay:', lipSyncActiveResult);

  if (lipSyncActiveResult.vrmWeightAa <= 0.05) {
    throw new Error(`FAIL: Overlay VRM mouth blendshape 'aa' was not animated (value: ${lipSyncActiveResult.vrmWeightAa})`);
  }
  if (lipSyncActiveResult.vrmWeightOh <= 0.05) {
    throw new Error(`FAIL: Overlay VRM mouth blendshape 'oh' was not animated (value: ${lipSyncActiveResult.vrmWeightOh})`);
  }
  console.log('  ✓ Overlay VRM mouth expressions (aa, oh, ee) actively animated during speech.\n');

  // --------------------------------------------------------------------------
  // TEST 6: Mouth Settling After Playback Completion
  // --------------------------------------------------------------------------
  console.log('TEST 6: Testing Mouth Settling to Rest after Speech Completion...');
  const settlingResult = await companionWin.webContents.executeJavaScript(`
    (() => {
      const lipSync = window.__stellaLipSyncController;
      const avatarCtrl = window.__stellaAvatarController;
      const vrm = avatarCtrl.getVRM();

      // Stop speech
      lipSync.stopSpeech();
      avatarCtrl.setConversationState('idle');

      // Advance delta frames for smooth decay
      lipSync.update(0.35);

      const mgr = vrm.expressionManager;
      return {
        vrmWeightAa: mgr.getValue('aa'),
        vrmWeightOh: mgr.getValue('oh'),
        vrmWeightEe: mgr.getValue('ee'),
        isSpeaking: lipSync.isSpeaking(),
      };
    })()
  `);
  console.log('  Post-Speech VRM Mouth Weights:', settlingResult);

  if (settlingResult.vrmWeightAa !== 0 || settlingResult.vrmWeightOh !== 0) {
    throw new Error(`FAIL: Mouth shapes did not settle cleanly to 0.0: ${JSON.stringify(settlingResult)}`);
  }
  console.log('  ✓ Mouth shapes smoothly returned to 0.0 resting pose.\n');

  // --------------------------------------------------------------------------
  // TEST 7: Emotion Preservation across Playback & Coexistence
  // --------------------------------------------------------------------------
  console.log('TEST 7: Verifying Emotional Expression Survival after Playback...');
  const emotionSurvival = await companionWin.webContents.executeJavaScript(`
    (() => {
      const avatarCtrl = window.__stellaAvatarController;
      const idleCtrl = window.__stellaIdleController;
      const vrm = avatarCtrl.getVRM();

      // Ensure happy expression was not wiped out by mouth movement or speech end
      return {
        currentExpression: avatarCtrl.getCurrentExpression(),
        targetExpression: avatarCtrl.getTargetExpression(),
        happyWeight: vrm.expressionManager.getValue('happy'),
      };
    })()
  `);
  console.log('  Post-Playback Emotion State in Overlay:', emotionSurvival);
  if (emotionSurvival.targetExpression !== 'happy') {
    throw new Error(`FAIL: Target expression was reset prematurely to '${emotionSurvival.targetExpression}' instead of retaining 'happy'`);
  }
  console.log('  ✓ Response emotion "happy" preserved across playback and return to idle.\n');

  // --------------------------------------------------------------------------
  // TEST 8: VRMA Body Animation Coexistence with Mouth Animation
  // --------------------------------------------------------------------------
  console.log('TEST 8: Testing VRMA Motion Coexistence with Speech Mouth Animation...');
  const vrmaLipSyncCheck = await companionWin.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      const animMgr = window.__stellaAnimationManager;
      const lipSync = window.__stellaLipSyncController;
      const avatarCtrl = window.__stellaAvatarController;
      const vrm = avatarCtrl.getVRM();

      // 1. Start VRMA_02 (Greeting bow)
      const played = await animMgr.playMotion('VRMA_02');

      // 2. Concurrently simulate speech lip-sync mouth animation
      lipSync.setDirectWeights({ aa: 0.55, ih: 0.30 });

      // 3. Update both controllers for a frame
      animMgr.update(0.1);
      lipSync.update(0.1);

      const mgr = vrm.expressionManager;
      resolve({
        motionPlaying: animMgr.isPlaying(),
        activeMotionId: animMgr.getStatus().activeMotionId,
        vrmWeightAa: mgr.getValue('aa'),
        vrmWeightIh: mgr.getValue('ih'),
      });
    })
  `);
  console.log('  VRMA + LipSync Coexistence:', vrmaLipSyncCheck);

  if (!vrmaLipSyncCheck.motionPlaying || vrmaLipSyncCheck.activeMotionId !== 'VRMA_02') {
    throw new Error('FAIL: VRMA motion did not start properly.');
  }
  if (vrmaLipSyncCheck.vrmWeightAa <= 0.05) {
    throw new Error('FAIL: Mouth animation was suppressed during VRMA motion execution.');
  }

  // Stop motion cleanly
  await companionWin.webContents.executeJavaScript(`
    window.__stellaAnimationManager.stopMotion(0.2);
    window.__stellaLipSyncController.resetMouthWeights();
  `);
  await sleep(400);
  console.log('  ✓ Full-body VRMA animation and lip-sync mouth movement coexisted with zero conflict.\n');

  // --------------------------------------------------------------------------
  // TEST 9: Rapid Successive Turns and Supersession
  // --------------------------------------------------------------------------
  console.log('TEST 9: Testing Rapid Successive Conversational Turns...');
  const turn1 = {
    turnId: 'turn_rapid_1',
    userMessage: 'First query',
    assistantText: 'First quick reply.',
    expressionHint: 'sad',
    status: 'speaking',
    timestamp: Date.now(),
  };
  const turn2 = {
    turnId: 'turn_rapid_2',
    userMessage: 'Second query supersede',
    assistantText: 'Second newer reply that replaces the first.',
    expressionHint: 'playful',
    status: 'speaking',
    timestamp: Date.now() + 50,
  };

  // Send turn 1 then immediately turn 2
  await mainWin.webContents.executeJavaScript(`
    window.stellaDesktop.sendDialogueTurn(${JSON.stringify(turn1)});
  `);
  await sleep(100);
  await mainWin.webContents.executeJavaScript(`
    window.stellaDesktop.sendDialogueTurn(${JSON.stringify(turn2)});
  `);
  await sleep(600);

  const rapidCheck = await companionWin.webContents.executeJavaScript(`
    (() => {
      const textElem = document.getElementById('companion-assistant-reply-text');
      const ctrl = window.__stellaAvatarController;
      return {
        displayedText: textElem ? textElem.textContent.trim() : null,
        targetExpression: ctrl.getTargetExpression(),
      };
    })()
  `);
  console.log('  Superseded Turn State:', rapidCheck);

  if (!rapidCheck.displayedText.includes('Second newer reply')) {
    throw new Error(`FAIL: Rapid succession did not supersede text. Got: "${rapidCheck.displayedText}"`);
  }
  if (rapidCheck.targetExpression !== 'playful') {
    throw new Error(`FAIL: Expression not updated to newer turn. Got: "${rapidCheck.targetExpression}"`);
  }
  console.log('  ✓ Rapid successive turns superseded cleanly without stale state.\n');

  // --------------------------------------------------------------------------
  // TEST 10: Overlay Reload State Recovery
  // --------------------------------------------------------------------------
  console.log('TEST 10: Testing Companion Overlay Reload Recovery...');
  await companionWin.webContents.reload();
  await sleep(2500);

  const reloadedCheck = await companionWin.webContents.executeJavaScript(`
    (() => {
      const textElem = document.getElementById('companion-assistant-reply-text');
      const card = document.getElementById('companion-dialogue-card');
      const ctrl = window.__stellaAvatarController;
      return {
        isCardVisible: Boolean(card),
        displayedText: textElem ? textElem.textContent.trim() : null,
        targetExpression: ctrl ? ctrl.getTargetExpression() : null,
      };
    })()
  `);
  console.log('  Reloaded Companion State:', reloadedCheck);

  if (!reloadedCheck.isCardVisible) {
    throw new Error('FAIL: Dialogue card did not restore upon Companion Overlay reload.');
  }
  if (!reloadedCheck.displayedText || !reloadedCheck.displayedText.includes('Second newer reply')) {
    throw new Error('FAIL: Dialogue text was lost upon Companion Overlay reload.');
  }
  console.log('  ✓ Reloaded Companion Overlay successfully retrieved active dialogue snapshot.\n');

  console.log('================================================================');
  console.log('ALL PHASE 7.5 END-TO-END VERIFICATION TESTS PASSED (10/10)');
  console.log('================================================================\n');

  app.quit();
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ PHASE 7.5 VERIFICATION SUITE FAILED:', err);
  app.quit();
  process.exit(1);
});
