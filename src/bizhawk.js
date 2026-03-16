const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { httpClient } = require('./http');
const { APP_CONFIG, saveAppConfig } = require('./config');
const state = require('./state');
const { sendWebhookNotification } = require('./webhook');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
// BizHawk Linux build ships EmuHawk.exe (.NET) + EmuHawkMono.sh launcher
const EMUHAWK_BINARY = 'EmuHawk.exe';
const EMUHAWK_LAUNCHER = isWindows ? 'EmuHawk.exe' : 'EmuHawkMono.sh';

// Pick the right BizHawk asset for this platform
function findPlatformAsset(assets) {
  if (isWindows) {
    return assets.find(a => a.name.includes('BizHawk') && a.name.endsWith('.zip') && !a.name.includes('linux'));
  }
  // macOS and Linux both use the linux build (BizHawk runs via .NET/Mono)
  return assets.find(a => a.name.includes('BizHawk') && a.name.includes('linux'))
    || assets.find(a => a.name.includes('BizHawk'));
}

// Core download + extract logic shared by downloadBizHawk and forceDownloadBizHawk
async function downloadAndInstallBizHawk() {
  if (state.mainWindow) {
    state.mainWindow.webContents.send('show-bizhawk-popup');
  }

  const response = await httpClient.get('https://api.github.com/repos/TASEmulators/BizHawk/releases/latest', {
    headers: { 'User-Agent': 'RetroChallenges-App/1.0' }
  });

  const release = response.data;
  const asset = findPlatformAsset(release.assets);

  if (!asset) {
    throw new Error(`Could not find BizHawk download for ${process.platform}`);
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

  const isTarGz = asset.name.endsWith('.tar.gz');
  const archiveExt = isTarGz ? '.tar.gz' : '.zip';
  const archivePath = path.join(APP_CONFIG.userDataPath, `temp-bizhawk${archiveExt}`);
  fs.writeFileSync(archivePath, zipResponse.data);

  const extractPath = path.join(APP_CONFIG.userDataPath, 'temp-bizhawk-extract');
  fs.mkdirSync(extractPath, { recursive: true });

  if (isTarGz) {
    // Use system tar to extract .tar.gz
    execSync(`tar -xzf "${archivePath}" -C "${extractPath}"`);
  } else {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractPath, true);
  }

  // Find EmuHawk.exe in the extracted files (always named .exe, even on Linux)
  const findEmuHawkBinary = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const found = findEmuHawkBinary(filePath);
        if (found) return found;
      } else if (file === EMUHAWK_BINARY) {
        return filePath;
      }
    }
    return null;
  };

  const emuHawkPath = findEmuHawkBinary(extractPath);
  if (!emuHawkPath) {
    throw new Error(`Could not find ${EMUHAWK_BINARY} in downloaded files`);
  }

  // Copy entire BizHawk folder to our directory
  const bizhawkDir = path.dirname(emuHawkPath);
  fs.cpSync(bizhawkDir, APP_CONFIG.bizhawkPath, { recursive: true });

  // On Windows, launch EmuHawk.exe directly; on Unix, use EmuHawkMono.sh
  const finalLauncherPath = path.join(APP_CONFIG.bizhawkPath, EMUHAWK_LAUNCHER);
  APP_CONFIG.emuhawkPath = finalLauncherPath;
  saveAppConfig(state);

  // Make scripts executable on Unix platforms
  if (!isWindows) {
    try {
      const scripts = fs.readdirSync(APP_CONFIG.bizhawkPath)
        .filter(f => f.endsWith('.sh'));
      for (const script of scripts) {
        fs.chmodSync(path.join(APP_CONFIG.bizhawkPath, script), 0o755);
      }
    } catch (e) {
      console.warn('Could not set executable permissions:', e.message);
    }
  }

  // Clean up temporary files
  fs.rmSync(archivePath);
  fs.rmSync(extractPath, { recursive: true, force: true });

  return finalLauncherPath;
}

async function downloadBizHawk() {
  try {
    console.log('Starting BizHawk download...');

    const existingBizHawkPath = path.join(APP_CONFIG.bizhawkPath, EMUHAWK_LAUNCHER);
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
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const commonPaths = [];

  if (isWindows) {
    commonPaths.push(
      'C:\\Program Files\\BizHawk\\EmuHawk.exe',
      'C:\\Program Files (x86)\\BizHawk\\EmuHawk.exe',
      'C:\\BizHawk\\EmuHawk.exe',
      'C:\\EmuHawk\\EmuHawk.exe',
      path.join(home, 'Desktop', 'BizHawk', 'EmuHawk.exe'),
      path.join(home, 'Downloads', 'BizHawk', 'EmuHawk.exe'),
      path.join(home, 'Documents', 'BizHawk', 'EmuHawk.exe')
    );
  } else if (isMac) {
    commonPaths.push(
      '/Applications/BizHawk/EmuHawkMono.sh',
      path.join(home, 'Applications', 'BizHawk', 'EmuHawkMono.sh'),
      path.join(home, 'Desktop', 'BizHawk', 'EmuHawkMono.sh'),
      path.join(home, 'Downloads', 'BizHawk', 'EmuHawkMono.sh')
    );
  } else {
    commonPaths.push(
      '/usr/local/bin/EmuHawkMono.sh',
      path.join(home, 'BizHawk', 'EmuHawkMono.sh'),
      path.join(home, 'Desktop', 'BizHawk', 'EmuHawkMono.sh'),
      path.join(home, 'Downloads', 'BizHawk', 'EmuHawkMono.sh')
    );
  }

  // Always check the app's own install location
  commonPaths.push(path.join(APP_CONFIG.bizhawkPath, EMUHAWK_LAUNCHER));

  for (const emuPath of commonPaths) {
    if (fs.existsSync(emuPath)) {
      console.log('Found EmuHawk at:', emuPath);
      return emuPath;
    }
  }

  return null;
}

// Check if Mono is available (required on macOS/Linux)
function checkMonoInstalled() {
  if (isWindows) return true;
  try {
    execSync('which mono', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function launchEmuHawk(romPath, luaScriptPath) {
  if (!APP_CONFIG.emuhawkPath) {
    console.error('EmuHawk path not configured');
    return { success: false, error: 'not_configured' };
  }

  if (!fs.existsSync(APP_CONFIG.emuhawkPath)) {
    console.error(`EmuHawk not found at: ${APP_CONFIG.emuhawkPath}`);
    return { success: false, error: 'not_found' };
  }

  if (!isWindows && !checkMonoInstalled()) {
    console.error('Mono runtime not found — required to run BizHawk on macOS/Linux');
    return { success: false, error: 'mono_missing' };
  }

  if (!romPath || !fs.existsSync(romPath)) {
    console.error(`ROM file not found: ${romPath}`);
    return { success: false, error: 'rom_missing' };
  }

  if (!luaScriptPath || !fs.existsSync(luaScriptPath)) {
    console.error(`Lua script not found: ${luaScriptPath}`);
    return { success: false, error: 'lua_missing' };
  }

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
