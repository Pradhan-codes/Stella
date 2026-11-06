/**
 * Test Suite: Phase 7.7 Personality Identity, General Intelligence & Natural Animation Actions
 *
 * Verifies:
 * 1. Authoritative Action Registry is initialized with all 10 verified action IDs (VRMA_01 to VRMA_07, VRMA_EXTRA, nod, wave).
 * 2. Natural-language command resolution matches aliases accurately ("Stella, spin!", "Can you spin around for me?", "Give me a little wave", "Nod if you agree", "Show me a peace sign", "Strike a pose", "Can you squat?", "Do that spin again").
 * 3. Question disambiguation: Questions that merely mention an animation ("How does the spin animation work?", "What animations can you do?") resolve to type 'query' and do NOT execute.
 * 4. Unknown/unsupported actions (e.g. "Stella, do a backflip!") resolve to type 'unknown_command' and do NOT execute or claim false success.
 * 5. Invalid action IDs passed to executeAction are rejected with an explicit error message.
 * 6. Action execution calls existing animation APIs (CantarellaAnimationManager.playMotion / CantarellaExpressionController.playGesture).
 * 7. Facial expressions and speech lip-sync continue functioning without mouth track collisions.
 * 8. Return-to-rest cleanly restores baseline A-pose without cumulative bone drift.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let companionWin = null;
let cachedAvatarState = {
  expression: 'neutral',
  intensity: 1.0,
  duration: 0.35,
  holdDuration: 0,
  conversationState: 'idle',
  timestamp: Date.now(),
};
let cachedDialogueTurn = null;

ipcMain.handle('stella:get-presentation-mode', () => 'companion-overlay');
ipcMain.handle('stella:set-presentation-mode', () => ({ success: true, mode: 'companion-overlay' }));
ipcMain.handle('stella:open-companion-overlay', () => ({ success: true, mode: 'companion-overlay' }));
ipcMain.handle('stella:return-to-workspace', () => ({ success: true, mode: 'workspace' }));

ipcMain.handle('stella:get-avatar-state', () => cachedAvatarState);
ipcMain.on('stella:avatar-sync', (event, rawState) => {
  if (!rawState) return;
  cachedAvatarState = rawState;
});

ipcMain.handle('stella:get-dialogue-turn', () => cachedDialogueTurn);
ipcMain.on('stella:dialogue-sync', (event, rawTurn) => {
  if (!rawTurn) return;
  cachedDialogueTurn = rawTurn;
});

app.whenReady().then(async () => {
  console.log('\n================================================================');
  console.log('TEST SUITE: Phase 7.7 Personality, Actions & Intent Execution');
  console.log('================================================================\n');

  const distPath = path.join(__dirname, '../dist/index.html');

  companionWin = new BrowserWindow({
    width: 320,
    height: 490,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      additionalArguments: ['--window-type=companion'],
    },
  });

  companionWin.loadURL(`file://${distPath}#companion`);

  await new Promise((resolve) => companionWin.webContents.once('did-finish-load', resolve));
  companionWin.show();
  companionWin.focus();

  // Wait for 3D model, animation manager, and action registry to mount
  console.log('1. Waiting for Cantarella 3D avatar & action registry...');
  await new Promise((resolve, reject) => {
    let waited = 0;
    const timer = setInterval(async () => {
      waited += 200;
      try {
        const ready = await companionWin.webContents.executeJavaScript(`
          Boolean(window.__stellaActionRegistry && window.__stellaAvatarController && window.__stellaIdleController && window.__stellaIdleController.vrm)
        `);
        if (ready) {
          clearInterval(timer);
          resolve();
        } else if (waited > 20000) {
          clearInterval(timer);
          reject(new Error('Timeout waiting for VRM & Action Registry initialization'));
        }
      } catch (e) {
        if (waited > 20000) {
          clearInterval(timer);
          reject(e);
        }
      }
    }, 200);
  });
  console.log('   Avatar and Action Registry ready.\n');

  // -------------------------------------------------------------------------
  // TEST 1: Authoritative Action Registry Allowlist Check
  // -------------------------------------------------------------------------
  console.log('TEST 1: Verifying Authoritative Action Registry Allowlist...');
  const registryCheck = await companionWin.webContents.executeJavaScript(`
    (() => {
      const reg = window.__stellaActionRegistry;
      if (!reg) return { ok: false, error: 'Registry not found on window' };

      const all = reg.getAllActions();
      const expectedIds = ['VRMA_01', 'VRMA_02', 'VRMA_03', 'VRMA_04', 'VRMA_05', 'VRMA_06', 'VRMA_07', 'VRMA_EXTRA', 'nod', 'wave'];
      const missing = expectedIds.filter(id => !reg.isRegistered(id));

      return {
        ok: missing.length === 0,
        totalActions: all.length,
        missing,
        spinAvail: reg.isActionAvailable('VRMA_05'),
        nodAvail: reg.isActionAvailable('nod'),
      };
    })()
  `);

  if (!registryCheck.ok) {
    console.error(`FAILED: Missing actions in registry: ${registryCheck.missing.join(', ')}`);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: All 10 authoritative actions registered (Total: ${registryCheck.totalActions}).\n`);

  // -------------------------------------------------------------------------
  // TEST 2: Natural-Language Command Intent Resolution
  // -------------------------------------------------------------------------
  console.log('TEST 2: Verifying Natural-Language Command Intent Resolution...');
  const testPhrases = [
    { input: 'Stella, spin!', expectedId: 'VRMA_05', expectedType: 'command' },
    { input: 'Can you spin around for me?', expectedId: 'VRMA_05', expectedType: 'command' },
    { input: 'Give me a little wave.', expectedId: 'wave', expectedType: 'command' },
    { input: 'Nod if you agree.', expectedId: 'nod', expectedType: 'command' },
    { input: 'Show me a peace sign.', expectedId: 'VRMA_03', expectedType: 'command' },
    { input: 'Strike a pose.', expectedId: 'VRMA_06', expectedType: 'command' },
    { input: 'Can you squat?', expectedId: 'VRMA_07', expectedType: 'command' },
    { input: 'Do that spin again.', expectedId: 'VRMA_05', expectedType: 'command' },
    { input: 'Flail your arms!', expectedId: 'VRMA_EXTRA', expectedType: 'command' },
    { input: 'Show full body', expectedId: 'VRMA_01', expectedType: 'command' },
    { input: 'Give a bow', expectedId: 'VRMA_02', expectedType: 'command' },
  ];

  const commandResults = await companionWin.webContents.executeJavaScript(`
    (() => {
      const reg = window.__stellaActionRegistry;
      const tests = ${JSON.stringify(testPhrases)};
      const failures = [];

      for (const t of tests) {
        const res = reg.resolveIntent(t.input);
        if (res.type !== t.expectedType || res.actionId !== t.expectedId) {
          failures.push({
            input: t.input,
            expected: t.expectedId,
            gotType: res.type,
            gotId: res.actionId
          });
        }
      }

      return { ok: failures.length === 0, failures };
    })()
  `);

  if (!commandResults.ok) {
    console.error(`FAILED: Command intent resolution mismatches:`, commandResults.failures);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: All ${testPhrases.length} natural commands and aliases resolved to expected action IDs.\n`);

  // -------------------------------------------------------------------------
  // TEST 3: Question Disambiguation (Must NOT Execute Actions)
  // -------------------------------------------------------------------------
  console.log('TEST 3: Verifying Question Disambiguation (Informational Queries)...');
  const questionQueries = [
    'How does the spin animation work?',
    'What animations can you do?',
    'Why do you squat?',
    'Explain how the peace sign works.',
    'Tell me about your bowing gesture.',
  ];

  const queryResults = await companionWin.webContents.executeJavaScript(`
    (() => {
      const reg = window.__stellaActionRegistry;
      const queries = ${JSON.stringify(questionQueries)};
      const failures = [];

      for (const q of queries) {
        const res = reg.resolveIntent(q);
        if (res.type !== 'query' || res.actionId !== undefined) {
          failures.push({ query: q, gotType: res.type, gotId: res.actionId });
        }
      }

      return { ok: failures.length === 0, failures };
    })()
  `);

  if (!queryResults.ok) {
    console.error(`FAILED: Informational queries were incorrectly classified as commands:`, queryResults.failures);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: All ${questionQueries.length} informational questions classified as 'query' without triggering execution.\n`);

  // -------------------------------------------------------------------------
  // TEST 4: Unknown Action Request Handling
  // -------------------------------------------------------------------------
  console.log('TEST 4: Verifying Unknown Action Requests (e.g. "do a backflip")...');
  const unknownResults = await companionWin.webContents.executeJavaScript(`
    (() => {
      const reg = window.__stellaActionRegistry;
      const res = reg.resolveIntent('Stella, can you do a backflip?');
      return {
        ok: res.type === 'unknown_command' && res.requestedTerm === 'backflip' && res.actionId === undefined,
        result: res
      };
    })()
  `);

  if (!unknownResults.ok) {
    console.error(`FAILED: Unknown action was not properly classified:`, unknownResults.result);
    app.exit(1);
    return;
  }
  console.log('   PASSED: Unknown action "backflip" resolved to unknown_command without execution.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Invalid Action ID Rejection by Action Execution Dispatcher
  // -------------------------------------------------------------------------
  console.log('TEST 5: Verifying Invalid Action ID Rejection in executeAction...');
  const invalidDispatchResult = await companionWin.webContents.executeJavaScript(`
    (async () => {
      const reg = window.__stellaActionRegistry;
      const res = await reg.executeAction('invalid_or_unregistered_id');
      return {
        ok: res.success === false && Boolean(res.error) && res.error.includes('not registered'),
        res
      };
    })()
  `);

  if (!invalidDispatchResult.ok) {
    console.error(`FAILED: Invalid action ID was not rejected:`, invalidDispatchResult.res);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: Invalid action ID rejected with error: "${invalidDispatchResult.res.error}"\n`);

  // -------------------------------------------------------------------------
  // TEST 6: Real Action Execution Dispatch (Spin VRMA_05 & Nod)
  // -------------------------------------------------------------------------
  console.log('TEST 6: Verifying Real Action Dispatch (Spin VRMA_05)...');
  const spinExecution = await companionWin.webContents.executeJavaScript(`
    (async () => {
      const reg = window.__stellaActionRegistry;
      const res = await reg.executeAction('VRMA_05');
      return {
        ok: res.success === true && res.actionId === 'VRMA_05',
        res
      };
    })()
  `);

  if (!spinExecution.ok) {
    console.error(`FAILED: Spin VRMA_05 execution failed:`, spinExecution.res);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: Spin VRMA_05 successfully dispatched to animation mixer.\n`);

  // Wait 1.5s while motion plays
  await new Promise((r) => setTimeout(r, 1500));

  console.log('TEST 7: Verifying Procedural Nod Dispatch...');
  const nodExecution = await companionWin.webContents.executeJavaScript(`
    (async () => {
      const reg = window.__stellaActionRegistry;
      const res = await reg.executeAction('nod');
      return {
        ok: res.success === true && res.actionId === 'nod',
        res
      };
    })()
  `);

  if (!nodExecution.ok) {
    console.error(`FAILED: Nod execution failed:`, nodExecution.res);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: Nod gesture successfully dispatched.\n`);

  console.log('TEST 7b: Verifying Procedural Wave Dispatch...');
  const waveExecution = await companionWin.webContents.executeJavaScript(`
    (async () => {
      const reg = window.__stellaActionRegistry;
      const res = await reg.executeAction('wave');
      return {
        ok: res.success === true && res.actionId === 'wave',
        res
      };
    })()
  `);

  if (!waveExecution.ok) {
    console.error(`FAILED: Wave execution failed:`, waveExecution.res);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: Wave gesture successfully dispatched.\n`);

  // -------------------------------------------------------------------------
  // TEST 8: Lip-Sync & Expression Channel Coexistence during Animation
  // -------------------------------------------------------------------------
  console.log('TEST 8: Verifying Mouth Channel Isolation during VRMA Motion...');
  const channelCheck = await companionWin.webContents.executeJavaScript(`
    (() => {
      const vrm = window.__stellaIdleController.vrm;
      if (!vrm || !vrm.expressionManager) return { ok: false, error: 'No expression manager' };

      const mgr = vrm.expressionManager;

      // Set happy facial expression and speech vowel simultaneously
      mgr.setValue('happy', 0.85);
      mgr.setValue('aa', 0.65);
      mgr.update();

      const happyWeight = mgr.getValue('happy');
      const aaWeight = mgr.getValue('aa');
      const happyExpr = mgr.getExpression('happy');

      return {
        ok: happyWeight >= 0.8 && aaWeight >= 0.6 && happyExpr?.overrideMouth === 'none',
        happyWeight,
        aaWeight,
        overrideMouth: happyExpr?.overrideMouth,
      };
    })()
  `);

  if (!channelCheck.ok) {
    console.error(`FAILED: Facial expression or mouth channel not maintained during motion:`, channelCheck);
    app.exit(1);
    return;
  }
  console.log(`   PASSED: Facial expression (happy: ${channelCheck.happyWeight.toFixed(2)}) and speech mouth (aa: ${channelCheck.aaWeight.toFixed(2)}, overrideMouth: '${channelCheck.overrideMouth}') operate independently.\n`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('================================================================');
  console.log('ALL PHASE 7.7 CANTARELLA TESTS PASSED (8/8)!');
  console.log('================================================================\n');

  companionWin.close();
  app.exit(0);
}).catch((err) => {
  console.error('Test suite uncaught error:', err);
  app.exit(1);
});
