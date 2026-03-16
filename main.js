const { app, BrowserWindow } = require('electron');
const { loadAppConfig } = require('./src/config');
const state = require('./src/state');
const { loadAuthData } = require('./src/auth');
const { ensureRomsDirectory, monitorJsonFile } = require('./src/challenges');
const { createMainWindow } = require('./src/window');
const { registerIpcHandlers } = require('./src/ipc');
const { sendWebhookNotification } = require('./src/webhook');

app.whenReady().then(async () => {
  loadAppConfig();
  registerIpcHandlers();
  ensureRomsDirectory();

  await sendWebhookNotification('RetroChallenges desktop app has been launched!', 'App Launched', true);

  const authData = await loadAuthData();
  if (authData && authData.user && authData.user.name) {
    state.isAuthenticated = true;
    state.userInfo = authData.user;
    state.authTokens = authData.tokens;
  }

  createMainWindow();
  monitorJsonFile();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  if (state.emuProcess) {
    state.emuProcess.kill();
  }
});
