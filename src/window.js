const { BrowserWindow, shell } = require('electron');
const path = require('path');
const state = require('./state');

function createMainWindow() {
  state.mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '..', 'assets', 'favicon.ico'),
    title: 'RetroChallenges',
    autoHideMenuBar: true
  });

  state.mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  state.mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show, displaying...');
    state.mainWindow.show();
    state.mainWindow.focus();
    console.log('Window should now be visible');
  });

  if (process.env.NODE_ENV === 'development') {
    state.mainWindow.webContents.openDevTools();
  }

  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  state.mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
}

module.exports = { createMainWindow };
