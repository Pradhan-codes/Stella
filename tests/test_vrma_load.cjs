const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  await win.loadFile(distPath, { hash: 'companion' });

  // Wait for VRM and animation manager
  await new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const ready = await win.webContents.executeJavaScript(`
          Boolean(window.__stellaAnimationManager && window.__stellaIdleController && window.__stellaIdleController.vrm)
        `);
        if (ready) {
          clearInterval(timer);
          resolve();
        }
      } catch {}
    }, 200);
  });

  console.log('Cantarella VRM loaded. Testing loadClip on all downloaded files...');

  const results = await win.webContents.executeJavaScript(`
    (async () => {
      const animMgr = window.__stellaAnimationManager;
      
      const filesToTest = [
        { id: 'vrma_01', file: 'VRMA_01.vrma' },
        { id: 'vrma_02', file: 'VRMA_02.vrma' },
        { id: 'vrma_03', file: 'VRMA_03.vrma' },
        { id: 'vrma_04', file: 'VRMA_04.vrma' },
        { id: 'vrma_05', file: 'VRMA_05.vrma' },
        { id: 'vrma_06', file: 'VRMA_06.vrma' },
        { id: 'vrma_07', file: 'VRMA_07.vrma' },
        { id: 'udebunbun', file: 'うでぶんぶん.vrma' },
        { id: 'reading', file: 'Reading (Loop).vrma' },
        { id: 'happy_synth', file: 'ハッピーシンセサイザ.vrma' },
      ];

      const out = [];

      for (const item of filesToTest) {
        const t0 = performance.now();
        try {
          const motionObj = {
            id: item.id,
            url: './animations/' + encodeURIComponent(item.file),
            file: item.file,
            name: item.file,
            nameJp: item.file,
            hint: item.file,
          };
          const clip = await animMgr.loadClip(motionObj);
          const t1 = performance.now();
          out.push({
            file: item.file,
            success: true,
            duration: clip.duration.toFixed(2),
            tracks: clip.tracks.length,
            timeMs: (t1 - t0).toFixed(1)
          });
        } catch (err) {
          out.push({
            file: item.file,
            success: false,
            error: err.message
          });
        }
      }
      return out;
    })()
  `);

  console.log('Results:');
  console.table(results);

  win.close();
  app.exit(0);
});
