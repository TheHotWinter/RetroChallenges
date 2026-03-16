const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { httpClient } = require('./http');
const { APP_CONFIG, saveAppConfig } = require('./config');
const state = require('./state');
const { sendWebhookNotification } = require('./webhook');

// Core download + extract logic shared by downloadBizHawk and forceDownloadBizHawk
async function downloadAndInstallBizHawk() {
  // Show popup notification
  if (state.mainWindow) {
    state.mainWindow.webContents.send('show-bizhawk-popup');
  }

  // Get latest release from GitHub API
  const response = await httpClient.get('https://api.github.com/repos/TASEmulators/BizHawk/releases/latest', {
    headers: { 'User-Agent': 'RetroChallenges-App/1.0' }
  });

  const release = response.data;
  const asset = release.assets.find(a => a.name.includes('BizHawk') && a.name.endsWith('.zip'));

  if (!asset) {
    throw new Error('Could not find BizHawk zip file in latest release');
  }

  console.log('Downloading BizHawk from:', asset.browser_download_url);

  const zipResponse = await httpClient.get(asset.browser_download_url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'RetroChallenges-App/1.0' },
    onDownloadProgress: (progressEvent) => {
      if (state.mainWindow && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        state.mainWindow.webContents.send('download-progress', {
          type: 'bizhawk',
          loaded: progressEvent.loaded,
          total: progressEvent.total,
          percent
        });
      }
    }
  });

  // Create BizHawk directory
  if (fs.existsSync(APP_CONFIG.bizhawkPath)) {
    fs.rmSync(APP_CONFIG.bizhawkPath, { recursive: true, force: true });
  }
  fs.mkdirSync(APP_CONFIG.bizhawkPath, { recursive: true });

  // Write zip file temporarily
  const zipPath = path.join(APP_CONFIG.userDataPath, 'temp-bizhawk.zip');
  fs.writeFileSync(zipPath, zipResponse.data);

  // Extract zip file
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  const extractPath = path.join(APP_CONFIG.userDataPath, 'temp-bizhawk-extract');
  zip.extractAllTo(extractPath, true);

  // Find EmuHawk.exe in the extracted files
  const findEmuHawkExe = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const found = findEmuHawkExe(filePath);
        if (found) return found;
      } else if (file === 'EmuHawk.exe') {
        return filePath;
      }
    }
    return null;
  };

  const emuHawkPath = findEmuHawkExe(extractPath);
  if (!emuHawkPath) {
    throw new Error('Could not find EmuHawk.exe in downloaded files');
  }

  // Copy entire BizHawk folder to our directory
  const bizhawkDir = path.dirname(emuHawkPath);
  fs.cpSync(bizhawkDir, APP_CONFIG.bizhawkPath, { recursive: true });

  // Set the EmuHawk path
  const finalEmuHawkPath = path.join(APP_CONFIG.bizhawkPath, 'EmuHawk.exe');
  APP_CONFIG.emuhawkPath = finalEmuHawkPath;
  saveAppConfig(state);

  // Clean up temporary files
  fs.rmSync(zipPath);
  fs.rmSync(extractPath, { recursive: true, force: true });

  return finalEmuHawkPath;
}

async function downloadBizHawk() {
  try {
    console.log('Starting BizHawk download...');

    // Check if BizHawk is already installed
    const existingBizHawkPath = path.join(APP_CONFIG.bizhawkPath, 'EmuHawk.exe');
    if (fs.existsSync(existingBizHawkPath)) {
      if (state.mainWindow) {
        state.mainWindow.webContents.send('show-bizhawk-warning');
      }
      return { success: false, error: 'BizHawk already installed', needsConfirmation: true };
    }

    const finalPath = await downloadAndInstallBizHawk();
    console.log('BizHawk downloaded and installed successfully at:', finalPath);

    await sendWebhookNotification(
      'BizHawk emulator downloaded and installed successfully!',
      'BizHawk Installed',
      true
    );

    return { success: true, message: 'BizHawk downloaded and installed successfully!' };
  } catch (error) {
    console.error('Error downloading BizHawk:', error);
    return { success: false, error: error.message };
  }
}

async function forceDownloadBizHawk() {
  try {
    console.log('Force downloading BizHawk...');

    const finalPath = await downloadAndInstallBizHawk();
    console.log('BizHawk force downloaded and installed successfully at:', finalPath);

    await sendWebhookNotification(
      'BizHawk emulator reinstalled successfully!',
      'BizHawk Reinstalled',
      true
    );

    return { success: true, message: 'BizHawk downloaded and installed successfully!' };
  } catch (error) {
    console.error('Error force downloading BizHawk:', error);
    return { success: false, error: error.message };
  }
}

function findEmuHawkPath() {
  const commonPaths = [
    'C:\\Program Files\\BizHawk\\EmuHawk.exe',
    'C:\\Program Files (x86)\\BizHawk\\EmuHawk.exe',
    'C:\\BizHawk\\EmuHawk.exe',
    'C:\\EmuHawk\\EmuHawk.exe',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'BizHawk', 'EmuHawk.exe'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'BizHawk', 'EmuHawk.exe'),
    path.join(process.env.USERPROFILE || '', 'Documents', 'BizHawk', 'EmuHawk.exe')
  ];

  for (const emuPath of commonPaths) {
    if (fs.existsSync(emuPath)) {
      console.log('Found EmuHawk at:', emuPath);
      return emuPath;
    }
  }

  return null;
}

function launchEmuHawk(romPath, luaScriptPath) {
  if (!APP_CONFIG.emuhawkPath) {
    console.error('EmuHawk path not configured');
    return false;
  }

  if (!fs.existsSync(APP_CONFIG.emuhawkPath)) {
    console.error(`EmuHawk.exe not found at: ${APP_CONFIG.emuhawkPath}`);
    return false;
  }

  if (!romPath || !fs.existsSync(romPath)) {
    console.error(`ROM file not found: ${romPath}`);
    return false;
  }

  if (!luaScriptPath || !fs.existsSync(luaScriptPath)) {
    console.error(`Lua script not found: ${luaScriptPath}`);
    return false;
  }

  // Kill existing process if running
  if (state.emuProcess) {
    try {
      state.emuProcess.kill();
      state.emuProcess = null;
    } catch (error) {
      console.warn('Error killing existing EmuHawk process:', error.message);
    }
  }

  try {
    const args = [romPath, '--lua', luaScriptPath];
    console.log('Launching EmuHawk with:', APP_CONFIG.emuhawkPath, args);

    state.emuProcess = spawn(APP_CONFIG.emuhawkPath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    state.emuProcess.on('error', (error) => {
      console.error('EmuHawk spawn error:', error);
      state.emuProcess = null;
    });

    state.emuProcess.on('close', (code, signal) => {
      console.log(`EmuHawk process closed with code ${code}, signal ${signal}`);
      state.emuProcess = null;
    });

    state.emuProcess.stderr.on('data', (data) => {
      console.log('EmuHawk stderr:', data.toString());
    });

    return true;
  } catch (error) {
    console.error('Error launching EmuHawk:', error);
    return false;
  }
}

module.exports = { downloadBizHawk, forceDownloadBizHawk, findEmuHawkPath, launchEmuHawk };
