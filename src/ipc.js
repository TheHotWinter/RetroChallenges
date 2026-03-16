const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { APP_CONFIG, saveAppConfig } = require('./config');
const state = require('./state');
const { authenticateWithGoogle, clearAuthData } = require('./auth');
const { downloadBizHawk, forceDownloadBizHawk, findEmuHawkPath, launchEmuHawk } = require('./bizhawk');
const { fetchChallenges, downloadAssetsFromRepo, ensureRomsDirectory } = require('./challenges');
const { sendWebhookNotification } = require('./webhook');

function registerIpcHandlers() {
  ipcMain.handle('authenticate', async () => {
    try {
      const result = await authenticateWithGoogle();
      if (result.success) {
        state.isAuthenticated = true;
        state.userInfo = result.user;
      }
      return result;
    } catch (error) {
      console.error('IPC authenticate error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-emuhawk', async () => {
    const filters = process.platform === 'win32'
      ? [{ name: 'Executable Files', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'All Files', extensions: ['*'] }];

    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Select EmuHawk',
      filters,
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      APP_CONFIG.emuhawkPath = result.filePaths[0];
      saveAppConfig(state);
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('download-bizhawk', async () => {
    try {
      return await downloadBizHawk();
    } catch (error) {
      console.error('IPC download-bizhawk error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('force-download-bizhawk', async () => {
    try {
      return await forceDownloadBizHawk();
    } catch (error) {
      console.error('IPC force-download-bizhawk error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('fetch-challenges', async () => {
    const assetResult = await downloadAssetsFromRepo();
    if (!assetResult.success) {
      console.warn('Failed to download assets:', assetResult.error);
    }
    return await fetchChallenges();
  });

  ipcMain.handle('launch-challenge', async (event, gameData, challengeData) => {
    try {
      console.log('=== LAUNCH CHALLENGE DEBUG ===');
      console.log('Game Data:', JSON.stringify(gameData, null, 2));
      console.log('Challenge Data:', JSON.stringify(challengeData, null, 2));

      // Get ROM filename from challenge data, fall back to name-based convention
      // Normalize backslashes from challenges.json (authored on Windows)
      const romFileName = gameData.rom
        ? path.basename(gameData.rom.replace(/\\/g, '/'))
        : `${gameData.name.toLowerCase().replace(/\s+/g, '_')}.nes`;

      // Try exact match first, then case-insensitive match
      let romPath = path.join(APP_CONFIG.romsPath, romFileName);
      if (!fs.existsSync(romPath)) {
        try {
          const romFiles = fs.readdirSync(APP_CONFIG.romsPath);
          const match = romFiles.find(f => f.toLowerCase() === romFileName.toLowerCase());
          if (match) romPath = path.join(APP_CONFIG.romsPath, match);
        } catch (e) { /* ignore */ }
      }
      if (!fs.existsSync(romPath)) {
        return {
          success: false,
          error: `Failed to launch challenge: Could not find the ${gameData.name} ROM file. Make sure the ROM file is placed in the roms folder and has the right name (${romFileName}).\n\nExpected location: ${romPath}`
        };
      }

      // Get Lua script path (normalize backslashes from challenges.json)
      let luaPath;
      if (challengeData.lua) {
        luaPath = path.join(APP_CONFIG.challengesPath, ...challengeData.lua.replace(/\\/g, '/').split('/'));
      } else {
        const gameFolder = gameData.name.toLowerCase().replace(/\s+/g, '_');
        const challengeFolder = challengeData.name.toLowerCase().replace(/\s+/g, '_');
        luaPath = path.join(APP_CONFIG.challengesPath, 'nes', gameFolder, challengeFolder, 'main.lua');
      }

      if (!fs.existsSync(luaPath)) {
        return {
          success: false,
          error: `Failed to launch challenge: Could not find the challenge script for ${challengeData.name}.\n\nExpected location: ${luaPath}\n\nPlease click the Refresh button to download the latest challenges.`
        };
      }

      console.log('Both ROM and Lua script found, launching EmuHawk...');
      const launched = launchEmuHawk(romPath, luaPath);

      if (launched === true) {
        console.log('EmuHawk launched successfully');
        await sendWebhookNotification(
          `Challenge launched: **${challengeData.name}** in **${gameData.name}**`,
          'Challenge Launched',
          true
        );
        return { success: true };
      } else {
        const reason = launched && launched.error;
        if (reason === 'deps_missing') {
          return { success: false, error: 'deps_missing', missing: launched.missing };
        } else if (reason === 'not_configured') {
          return { success: false, error: 'Failed to launch challenge: EmuHawk path not configured. Please click the auto-detect button or use Browse to select EmuHawk manually.' };
        } else if (reason === 'not_found') {
          return { success: false, error: `Failed to launch challenge: EmuHawk not found at: ${APP_CONFIG.emuhawkPath}\n\nPlease check the path and try again, or use the auto-detect button.` };
        } else {
          return { success: false, error: 'Failed to launch challenge: Could not start EmuHawk. Please check that EmuHawk is properly installed and try again.' };
        }
      }
    } catch (error) {
      console.log('GENERAL ERROR:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-user-info', () => state.userInfo);

  ipcMain.handle('get-emuhawk-path', () => APP_CONFIG.emuhawkPath);

  ipcMain.handle('get-user-data-paths', () => ({
    userDataPath: APP_CONFIG.userDataPath,
    romsPath: APP_CONFIG.romsPath,
    challengesPath: APP_CONFIG.challengesPath,
    configPath: APP_CONFIG.configPath
  }));

  ipcMain.handle('auto-detect-emuhawk', () => {
    const detectedPath = findEmuHawkPath();
    if (detectedPath) {
      APP_CONFIG.emuhawkPath = detectedPath;
      saveAppConfig(state);
      return { success: true, path: detectedPath };
    }
    return { success: false, message: 'EmuHawk not found in common locations' };
  });

  ipcMain.handle('logout', () => {
    clearAuthData();
    return true;
  });

  ipcMain.handle('get-config', () => ({
    emuhawkPath: APP_CONFIG.emuhawkPath
  }));

  ipcMain.handle('get-telemetry', () => state.telemetryEnabled);

  ipcMain.handle('set-telemetry', (event, enabled) => {
    state.telemetryEnabled = !!enabled;
    saveAppConfig(state);
    return state.telemetryEnabled;
  });

  ipcMain.handle('install-mono', async () => {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Auto-install is only supported on macOS' };
    }
    try {
      const { httpClient } = require('./http');
      const monoUrl = 'https://download.mono-project.com/archive/6.12.0/macos-10-universal/MonoFramework-MDK-6.12.0.206.macos10.xamarin.universal.pkg';
      const pkgPath = path.join(APP_CONFIG.userDataPath, 'MonoFramework.pkg');

      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('download-progress', { type: 'deps', percent: 0, loaded: 0, total: 1 });
      }

      const response = await httpClient.get(monoUrl, {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (state.mainWindow && !state.mainWindow.isDestroyed() && progressEvent.total) {
            const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            state.mainWindow.webContents.send('download-progress', {
              type: 'deps',
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percent
            });
          }
        }
      });

      fs.writeFileSync(pkgPath, response.data);
      const { exec } = require('child_process');
      exec(`open "${pkgPath}"`);

      return { success: true, message: 'Mono installer opened.' };
    } catch (error) {
      console.error('Error installing Mono:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('install-xquartz', async () => {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'XQuartz is only needed on macOS' };
    }
    try {
      const { httpClient } = require('./http');
      const pkgPath = path.join(APP_CONFIG.userDataPath, 'XQuartz.pkg');

      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('download-progress', { type: 'deps', percent: 0, loaded: 0, total: 1 });
      }

      const response = await httpClient.get('https://github.com/XQuartz/XQuartz/releases/download/XQuartz-2.8.5/XQuartz-2.8.5.pkg', {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (state.mainWindow && !state.mainWindow.isDestroyed() && progressEvent.total) {
            const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            state.mainWindow.webContents.send('download-progress', {
              type: 'deps',
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percent
            });
          }
        }
      });

      fs.writeFileSync(pkgPath, response.data);
      const { exec } = require('child_process');
      exec(`open "${pkgPath}"`);

      return { success: true, message: 'XQuartz installer opened.' };
    } catch (error) {
      console.error('Error installing XQuartz:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('install-sdl2', async () => {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'SDL2 patching is only needed on macOS' };
    }
    try {
      const { httpClient } = require('./http');
      const dmgPath = path.join(APP_CONFIG.userDataPath, 'SDL2.dmg');

      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('download-progress', { type: 'deps', percent: 0, loaded: 0, total: 1 });
      }

      const response = await httpClient.get('https://github.com/libsdl-org/SDL/releases/download/release-2.30.9/SDL2-2.30.9.dmg', {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (state.mainWindow && !state.mainWindow.isDestroyed() && progressEvent.total) {
            const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            state.mainWindow.webContents.send('download-progress', {
              type: 'deps',
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percent
            });
          }
        }
      });

      fs.writeFileSync(dmgPath, response.data);

      // Mount DMG, copy SDL2 framework, unmount
      const { execSync } = require('child_process');
      execSync(`hdiutil attach "${dmgPath}" -nobrowse -quiet`);
      const sdl2Dest = path.join(APP_CONFIG.bizhawkPath, 'dll', 'libSDL2.dylib');
      // Remove old .so or broken symlink
      if (fs.existsSync(sdl2Dest)) fs.rmSync(sdl2Dest);
      fs.copyFileSync('/Volumes/SDL2/SDL2.framework/Versions/A/SDL2', sdl2Dest);
      execSync('hdiutil detach /Volumes/SDL2 -quiet');
      fs.rmSync(dmgPath);

      return { success: true, message: 'SDL2 installed.' };
    } catch (error) {
      console.error('Error installing SDL2:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-rom-folder', async () => {
    try {
      ensureRomsDirectory();
      await shell.openPath(APP_CONFIG.romsPath);
      return { success: true, path: APP_CONFIG.romsPath };
    } catch (error) {
      console.error('Error opening ROM folder:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerIpcHandlers };
