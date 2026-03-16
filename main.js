const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const { loadAppConfig } = require('./src/config');
const state = require('./src/state');
const { loadAuthData } = require('./src/auth');
const { ensureRomsDirectory, monitorJsonFile, stopMonitoringJsonFile } = require('./src/challenges');
const { createMainWindow } = require('./src/window');
const { registerIpcHandlers } = require('./src/ipc');
const { sendWebhookNotification } = require('./src/webhook');

// Set app name so macOS menu bar shows "RetroChallenges" instead of "Electron"
app.name = 'RetroChallenges';

// Set dock icon on macOS
if (process.platform === 'darwin' && app.dock) {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  app.dock.setIcon(nativeImage.createFromPath(iconPath));
}

app.whenReady().then(async () => {
  loadAppConfig(state);
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
  stopMonitoringJsonFile();
  if (state.emuProcess) {
    state.emuProcess.kill();
  }
});
