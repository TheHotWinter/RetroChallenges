const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');


// Load configuration
let CONFIG = {};
try {
  CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (error) {
  console.error('Error loading config.json:', error);
  CONFIG = {
    google: {
      clientId: 'YOUR_GOOGLE_CLIENT_ID',
      clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
      redirectUri: 'http://localhost:8080/callback'
    },
    challenges: {
      url: 'https://raw.githubusercontent.com/mattd1980/retrochallenges-assets/refs/heads/main/challenges.json'
    }
  };
}

// Allow overriding sensitive values via environment variables
CONFIG.google = CONFIG.google || {};
CONFIG.google.clientId = process.env.GOOGLE_CLIENT_ID || CONFIG.google.clientId;
CONFIG.google.clientSecret = process.env.GOOGLE_CLIENT_SECRET || CONFIG.google.clientSecret;
CONFIG.google.redirectUri = process.env.GOOGLE_REDIRECT_URI || CONFIG.google.redirectUri;
CONFIG.challenges = CONFIG.challenges || {};
CONFIG.challenges.url = process.env.CHALLENGES_URL || CONFIG.challenges.url;


// App configuration
const APP_CONFIG = {
  emuhawkPath: '', // Will be set by user
  challengesUrl: CONFIG.challenges.url,
  // Use userData locations for files and directories
  userDataPath: app.getPath('userData'), // Base userData path
  jsonOutputPath: path.join(app.getPath('userData'), 'challenge_data.json'),
  romsPath: path.join(app.getPath('userData'), 'roms'), // Directory for ROM files
  challengesPath: path.join(app.getPath('userData'), 'challenges'), // Directory for downloaded challenges
  authDataPath: path.join(app.getPath('userData'), 'auth_data.json'), // File to store authentication data
  configPath: path.join(app.getPath('userData'), 'app_config.json'), // File to store app configuration
  bizhawkPath: path.join(app.getPath('userData'), 'bizhawk') // Directory for BizHawk installation
};

// Discord webhook configuration
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1419125129111277578/Zm-DL3Vl1UPdEtU4SEY9yJwPez7ysbQWOMEt5Jgy8gVLlO4DdHV1KfQ4KRuM9KWR9DDQ';

let mainWindow;
let emuProcess = null;
let isAuthenticated = false;
let userInfo = null;
let challengesData = null;
let authTokens = null;


// Download and install BizHawk
async function downloadBizHawk() {
  try {
    console.log('Starting BizHawk download...');
    
    // Check if BizHawk is already installed
    const existingBizHawkPath = path.join(APP_CONFIG.bizhawkPath, 'EmuHawk.exe');
    if (fs.existsSync(existingBizHawkPath)) {
      // Show warning popup for existing installation
      if (mainWindow) {
        mainWindow.webContents.send('show-bizhawk-warning');
      }
      
      // Wait for user confirmation (we'll handle this in the frontend)
      return { success: false, error: 'BizHawk already installed', needsConfirmation: true };
    }
    
    // Show popup notification
    if (mainWindow) {
      mainWindow.webContents.send('show-bizhawk-popup');
    }
    
    // Get latest release from GitHub API
    const response = await axios.get('https://api.github.com/repos/TASEmulators/BizHawk/releases/latest', {
      headers: {
        'User-Agent': 'RetroChallenges-App/1.0'
      }
    });
    
    const release = response.data;
    const asset = release.assets.find(asset => asset.name.includes('BizHawk') && asset.name.endsWith('.zip'));
    
    if (!asset) {
      throw new Error('Could not find BizHawk zip file in latest release');
    }
    
    console.log('Downloading BizHawk from:', asset.browser_download_url);
    
    // Download the zip file
    const zipResponse = await axios.get(asset.browser_download_url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'RetroChallenges-App/1.0'
      }
    });
    
    // Create BizHawk directory
    if (fs.existsSync(APP_CONFIG.bizhawkPath)) {
      fs.rmSync(APP_CONFIG.bizhawkPath, { recursive: true, force: true });
    }
    fs.mkdirSync(APP_CONFIG.bizhawkPath, { recursive: true });
    
    // Write zip file temporarily
    const zipPath = path.join(__dirname, 'temp-bizhawk.zip');
    fs.writeFileSync(zipPath, zipResponse.data);
    
    // Extract zip file
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const extractPath = path.join(__dirname, 'temp-bizhawk-extract');
    zip.extractAllTo(extractPath, true);
    
    // Find EmuHawk.exe in the extracted files
    const findEmuHawk = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          const found = findEmuHawk(filePath);
          if (found) return found;
        } else if (file === 'EmuHawk.exe') {
          return filePath;
        }
      }
      return null;
    };
    
    const emuHawkPath = findEmuHawk(extractPath);
    if (!emuHawkPath) {
      throw new Error('Could not find EmuHawk.exe in downloaded files');
    }
    
    // Copy entire BizHawk folder to our directory
    const bizhawkDir = path.dirname(emuHawkPath);
    fs.cpSync(bizhawkDir, APP_CONFIG.bizhawkPath, { recursive: true });
    
    // Set the EmuHawk path
    const finalEmuHawkPath = path.join(APP_CONFIG.bizhawkPath, 'EmuHawk.exe');
    APP_CONFIG.emuhawkPath = finalEmuHawkPath;
    
    // Save the configuration
    saveAppConfig();
    
    // Clean up temporary files
    fs.rmSync(zipPath);
    fs.rmSync(extractPath, { recursive: true, force: true });
    
    console.log('BizHawk downloaded and installed successfully at:', finalEmuHawkPath);
    return { success: true, message: 'BizHawk downloaded and installed successfully!' };
    
  } catch (error) {
    console.error('Error downloading BizHawk:', error);
    return { success: false, error: error.message };
  }
}

// Force download BizHawk (ignores existing installation)
async function forceDownloadBizHawk() {
  try {
    console.log('Force downloading BizHawk...');
    
    // Show popup notification
    if (mainWindow) {
      mainWindow.webContents.send('show-bizhawk-popup');
    }
    
    // Get latest release from GitHub API
    const response = await axios.get('https://api.github.com/repos/TASEmulators/BizHawk/releases/latest', {
      headers: {
        'User-Agent': 'RetroChallenges-App/1.0'
      }
    });
    
    const release = response.data;
    const asset = release.assets.find(asset => asset.name.includes('BizHawk') && asset.name.endsWith('.zip'));
    
    if (!asset) {
      throw new Error('Could not find BizHawk zip file in latest release');
    }
    
    console.log('Downloading BizHawk from:', asset.browser_download_url);
    
    // Download the zip file
    const zipResponse = await axios.get(asset.browser_download_url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'RetroChallenges-App/1.0'
      }
    });
    
    // Create BizHawk directory (force overwrite)
    if (fs.existsSync(APP_CONFIG.bizhawkPath)) {
      fs.rmSync(APP_CONFIG.bizhawkPath, { recursive: true, force: true });
    }
    fs.mkdirSync(APP_CONFIG.bizhawkPath, { recursive: true });
    
    // Write zip file temporarily
    const zipPath = path.join(__dirname, 'temp-bizhawk.zip');
    fs.writeFileSync(zipPath, zipResponse.data);
    
    // Extract zip file
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const extractPath = path.join(__dirname, 'temp-bizhawk-extract');
    zip.extractAllTo(extractPath, true);
    
    // Find EmuHawk.exe in the extracted files
    const findEmuHawk = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          const found = findEmuHawk(filePath);
          if (found) return found;
        } else if (file === 'EmuHawk.exe') {
          return filePath;
        }
      }
      return null;
    };
    
    const emuHawkPath = findEmuHawk(extractPath);
    if (!emuHawkPath) {
      throw new Error('Could not find EmuHawk.exe in downloaded files');
    }
    
    // Copy entire BizHawk folder to our directory
    const bizhawkDir = path.dirname(emuHawkPath);
    fs.cpSync(bizhawkDir, APP_CONFIG.bizhawkPath, { recursive: true });
    
    // Set the EmuHawk path
    const finalEmuHawkPath = path.join(APP_CONFIG.bizhawkPath, 'EmuHawk.exe');
    APP_CONFIG.emuhawkPath = finalEmuHawkPath;
    
    // Save the configuration
    saveAppConfig();
    
    // Clean up temporary files
    fs.rmSync(zipPath);
    fs.rmSync(extractPath, { recursive: true, force: true });
    
    console.log('BizHawk force downloaded and installed successfully at:', finalEmuHawkPath);
    return { success: true, message: 'BizHawk downloaded and installed successfully!' };
    
  } catch (error) {
    console.error('Error force downloading BizHawk:', error);
    return { success: false, error: error.message };
  }
}

// Send Discord webhook notification
async function sendWebhookNotification(message, title = 'RetroChallenges App') {
  try {
    const webhookData = {
      username: 'RetroChallenges Bot',
      avatar_url: 'https://retrochallenges.com/assets/icon.png',
      embeds: [{
        title: title,
        description: message,
        color: 0x00ff00, // Green color
        timestamp: new Date().toISOString(),
        footer: {
          text: 'RetroChallenges Desktop App'
        }
      }]
    };

    await axios.post(DISCORD_WEBHOOK_URL, webhookData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Webhook notification sent successfully');
  } catch (error) {
    console.error('Error sending webhook notification:', error.message);
    // Don't throw error - webhook failures shouldn't break the app
  }
}

// Load app configuration
function loadAppConfig() {
  try {
    if (fs.existsSync(APP_CONFIG.configPath)) {
      const configData = JSON.parse(fs.readFileSync(APP_CONFIG.configPath, 'utf8'));
      if (configData.emuhawkPath) {
        APP_CONFIG.emuhawkPath = configData.emuhawkPath;
      }
    }
  } catch (error) {
    console.error('Error loading app config:', error);
  }
}

// Save app configuration
function saveAppConfig() {
  try {
    const configData = {
      emuhawkPath: APP_CONFIG.emuhawkPath
    };
    fs.writeFileSync(APP_CONFIG.configPath, JSON.stringify(configData, null, 2));
  } catch (error) {
    console.error('Error saving app config:', error);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'favicon.ico'),
    title: 'RetroChallenges',
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show, displaying...');
    mainWindow.show();
    mainWindow.focus();
    console.log('Window should now be visible');
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // If it's an external URL (not localhost or file://), open in default browser
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
}


// Google OAuth implementation - Real OAuth flow with browser window
async function authenticateWithGoogle() {
  try {
    // Server-side OAuth: open the hosted login page which will perform the
    // authorization code exchange and store user info in the server session.
    const SERVER_LOGIN_URL = 'https://retrochallenges.com/public/auth/google/login.php';

    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      parent: mainWindow,
      modal: true,
      resizable: false
    });

    // Load the server login URL. The server will redirect to Google and back.
    await authWindow.loadURL(SERVER_LOGIN_URL);

    // Wait for the success page that contains a window.USER JSON blob.
    return new Promise((resolve) => {
      // When a page finishes loading, try to read the embedded user object.
      authWindow.webContents.on('did-finish-load', async () => {
        try {
          // Evaluate a small script to check for window.USER
          const hasUser = await authWindow.webContents.executeJavaScript('typeof window.USER !== "undefined"');
          if (hasUser) {
            // Read the user object from the page
            const user = await authWindow.webContents.executeJavaScript('window.USER');

            // Close the auth window
            authWindow.close();

            // Persist minimal auth data locally (no tokens are stored client-side)
            isAuthenticated = true;
            userInfo = user;

            // Save a local auth record without tokens to note user identity
            saveAuthData(user, null);

            resolve({ success: true, user: user, accessToken: null });
            return;
          }
        } catch (e) {
          // Ignore script execution errors while pages that don't include USER load
        }
      });

      // If user closes window, consider authentication cancelled
      authWindow.on('closed', () => {
        resolve({ success: false, error: 'Authentication cancelled' });
      });
    });
  } catch (error) {
    console.error('OAuth authentication error (server-based):', error);
    return { success: false, error: error.message };
  }
}

// Exchange authorization code for access token

// Fetch challenges from remote URL
async function fetchChallenges() {
  try {
    const response = await axios.get(APP_CONFIG.challengesUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'RetroChallenges-App/1.0'
      }
    });
    
    challengesData = response.data;
    return challengesData;
  } catch (error) {
    console.error('Error fetching challenges:', error.message);
    // Return mock data if fetch fails
    challengesData = {
      games: [
        {
          name: "Castlevania",
          rom: "castlevania.nes",
          challenges: [
            { name: "Get 5000 points!", lua: "castlevania_5000pts.lua" },
            { name: "Kill Dracula!", lua: "castlevania_dracula.lua" }
          ]
        },
        {
          name: "Super Mario Bros",
          rom: "super_mario_bros.nes",
          challenges: [
            { name: "Get 5 1ups!", lua: "mario_5_1ups.lua" },
            { name: "Speed Run Level 1", lua: "mario_speedrun.lua" }
          ]
        }
      ]
    };
    return challengesData;
  }
}

// Download assets from GitHub release zip file
async function downloadAssetsFromRepo() {
  try {
    const AdmZip = require('adm-zip');
    
    // Download the latest release zip from GitHub
    const releaseUrl = 'https://github.com/mattd1980/retrochallenges-assets/archive/refs/heads/main.zip';
    
    console.log('Downloading assets from GitHub release...');
    const response = await axios.get(releaseUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'RetroChallenges-App/1.0'
      }
    });
    
    // Create challenges directory if it doesn't exist
    const challengesDir = APP_CONFIG.challengesPath;
    if (fs.existsSync(challengesDir)) {
      fs.rmSync(challengesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(challengesDir, { recursive: true });
    
    // Write zip file temporarily
    const zipPath = path.join(__dirname, 'temp-assets.zip');
    fs.writeFileSync(zipPath, response.data);
    
    // Extract zip file
    const zip = new AdmZip(zipPath);
    const extractPath = path.join(__dirname, 'temp-extract');
    zip.extractAllTo(extractPath, true);
    
    // Find the extracted folder (should be retrochallenges-assets-main)
    const extractedFolders = fs.readdirSync(extractPath);
    const assetsFolder = extractedFolders.find(folder => folder.startsWith('retrochallenges-assets'));
    
    if (!assetsFolder) {
      throw new Error('Could not find extracted assets folder');
    }
    
    // Move contents from extracted folder to challenges folder
    const sourcePath = path.join(extractPath, assetsFolder);
    const files = fs.readdirSync(sourcePath);
    
    for (const file of files) {
      const sourceFile = path.join(sourcePath, file);
      const targetFile = path.join(challengesDir, file);
      
      if (fs.statSync(sourceFile).isDirectory()) {
        // Copy directory recursively
        fs.cpSync(sourceFile, targetFile, { recursive: true });
      } else {
        // Copy file
        fs.copyFileSync(sourceFile, targetFile);
      }
    }
    
    // Clean up temporary files
    fs.rmSync(zipPath);
    fs.rmSync(extractPath, { recursive: true, force: true });
    
    console.log('Assets downloaded and extracted successfully');
    return { success: true, message: 'Assets downloaded successfully from GitHub release' };
  } catch (error) {
    console.error('Error downloading assets:', error.message);
    return { success: false, error: error.message };
  }
}

// Ensure ROMs directory exists
function ensureRomsDirectory() {

  try {
    if (!fs.existsSync(APP_CONFIG.romsPath)) {
      fs.mkdirSync(APP_CONFIG.romsPath, { recursive: true });
    }
  } catch (error) {
    console.error('Error creating ROMs directory:', error);
    // Continue without ROMs directory
  }
}

// Save authentication data to file
function saveAuthData(user, tokens) {
  try {
    const authData = {
      user: user,
      tokens: tokens,
      timestamp: Date.now()
    };
    fs.writeFileSync(APP_CONFIG.authDataPath, JSON.stringify(authData, null, 2));
  } catch (error) {
    console.error('Error saving auth data:', error);
  }
}

// Load authentication data from file
async function loadAuthData() {
  try {
    if (fs.existsSync(APP_CONFIG.authDataPath)) {
      const authData = JSON.parse(fs.readFileSync(APP_CONFIG.authDataPath, 'utf8'));
      
      // Validate that we have valid user data
      if (!authData.user || !authData.user.name || !authData.user.email) {
        console.log('Invalid auth data: missing user information');
        clearAuthData();
        return null;
      }
      
      // Check if tokens are still valid (not expired)
      if (authData.tokens && authData.tokens.expires_at > Date.now()) {
        return authData;
      } else {
        // Try to refresh token if expired
        return await refreshAuthToken(authData.tokens?.refresh_token);
      }
    }
  } catch (error) {
    console.error('Error loading auth data:', error);
    // If there's an error parsing the file, clear it
    clearAuthData();
  }
  return null;
}

// Refresh access token using refresh token
async function refreshAuthToken(refreshToken) {
  if (!refreshToken) {
    return null;
  }
  
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: CONFIG.google.clientId,
      client_secret: CONFIG.google.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const { access_token, expires_in } = response.data;
    
    // Get user info with new token
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const user = {
      name: userResponse.data.name,
      email: userResponse.data.email,
      id: userResponse.data.id,
      picture: userResponse.data.picture
    };

    // Update tokens
    authTokens = {
      access_token,
      refresh_token, // Keep the same refresh token
      expires_at: Date.now() + (expires_in * 1000)
    };
    
    // Save updated auth data
    saveAuthData(user, authTokens);
    
    return { user, tokens: authTokens };
  } catch (error) {
    console.error('Token refresh failed:', error);
    // If refresh fails, delete auth data file
    try {
      if (fs.existsSync(APP_CONFIG.authDataPath)) {
        fs.unlinkSync(APP_CONFIG.authDataPath);
      }
    } catch (deleteError) {
      console.error('Error deleting auth data:', deleteError);
    }
    return null;
  }
}

// Clear authentication data
function clearAuthData() {
  try {
    if (fs.existsSync(APP_CONFIG.authDataPath)) {
      fs.unlinkSync(APP_CONFIG.authDataPath);
    }
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
  isAuthenticated = false;
  userInfo = null;
  authTokens = null;
}

// Try to find EmuHawk automatically in common locations
function findEmuHawkPath() {
  const commonPaths = [
    'C:\\Program Files\\BizHawk\\EmuHawk.exe',
    'C:\\Program Files (x86)\\BizHawk\\EmuHawk.exe',
    'C:\\BizHawk\\EmuHawk.exe',
    'C:\\EmuHawk\\EmuHawk.exe',
    path.join(process.env.USERPROFILE, 'Desktop', 'BizHawk', 'EmuHawk.exe'),
    path.join(process.env.USERPROFILE, 'Downloads', 'BizHawk', 'EmuHawk.exe'),
    path.join(process.env.USERPROFILE, 'Documents', 'BizHawk', 'EmuHawk.exe')
  ];

  for (const emuPath of commonPaths) {
    if (fs.existsSync(emuPath)) {
      console.log('Found EmuHawk at:', emuPath);
      return emuPath;
    }
  }

  return null;
}

// Launch EmuHawk with ROM and Lua script
function launchEmuHawk(romPath, luaScriptPath) {
  // Validate EmuHawk path
  if (!APP_CONFIG.emuhawkPath) {
    console.error('EmuHawk path not configured');
    return false;
  }

  if (!fs.existsSync(APP_CONFIG.emuhawkPath)) {
    console.error(`EmuHawk.exe not found at: ${APP_CONFIG.emuhawkPath}`);
    return false;
  }

  // Validate ROM file
  if (!romPath || !fs.existsSync(romPath)) {
    console.error(`ROM file not found: ${romPath}`);
    return false;
  }

  // Validate Lua script
  if (!luaScriptPath || !fs.existsSync(luaScriptPath)) {
    console.error(`Lua script not found: ${luaScriptPath}`);
    return false;
  }

  // Kill existing process if running
  if (emuProcess) {
    try {
      emuProcess.kill();
      emuProcess = null;
    } catch (error) {
      console.warn('Error killing existing EmuHawk process:', error.message);
    }
  }

  try {
    // EmuHawk command line arguments
    // Note: Different versions of EmuHawk/BizHawk may have different command line options
    const args = [
      romPath,                    // ROM file path
      '--lua', luaScriptPath     // Load Lua script
    ];

    console.log('Launching EmuHawk with:', APP_CONFIG.emuhawkPath, args);

    emuProcess = spawn(APP_CONFIG.emuhawkPath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'] // Capture stderr for debugging
    });

    emuProcess.on('error', (error) => {
      console.error('EmuHawk spawn error:', error);
      emuProcess = null;
    });

    emuProcess.on('close', (code, signal) => {
      console.log(`EmuHawk process closed with code ${code}, signal ${signal}`);
      emuProcess = null;
    });

    // Capture stderr for debugging
    emuProcess.stderr.on('data', (data) => {
      console.log('EmuHawk stderr:', data.toString());
    });

    // Give the process a moment to start
    setTimeout(() => {
      if (emuProcess && emuProcess.exitCode === null) {
        console.log('EmuHawk launched successfully');
        return true;
      }
    }, 1000);

    return true;

  } catch (error) {
    console.error('Error launching EmuHawk:', error);
    return false;
  }
}

// Monitor JSON file for changes
function monitorJsonFile() {
  if (!fs.existsSync(APP_CONFIG.jsonOutputPath)) {
    // Create empty JSON file if it doesn't exist
    fs.writeFileSync(APP_CONFIG.jsonOutputPath, JSON.stringify({}));
  }

  fs.watchFile(APP_CONFIG.jsonOutputPath, async (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      try {
        const data = JSON.parse(fs.readFileSync(APP_CONFIG.jsonOutputPath, 'utf8'));
        
        // Validate required fields and add date if missing
        if (data.username && data.game && data.challengeName) {
          // Add date if not present
          if (!data.date) {
            data.date = new Date().toISOString();
          }
          
          
          // Log challenge completion
          console.log('Challenge completed:', data);
          
          // Notify renderer
          if (mainWindow) {
            mainWindow.webContents.send('challenge-completed', data);
          }
        }
      } catch (error) {
        console.error('Error processing JSON file:', error);
      }
    }
  });
}


// IPC Handlers - Register after app is ready
function registerIpcHandlers() {
  ipcMain.handle('authenticate', async () => {
    try {
      const result = await authenticateWithGoogle();
      
      if (result.success) {
        isAuthenticated = true;
        userInfo = result.user;
      }
      
      return result;
    } catch (error) {
      console.error('IPC authenticate error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-emuhawk', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select EmuHawk.exe',
      filters: [
        { name: 'Executable Files', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      APP_CONFIG.emuhawkPath = result.filePaths[0];
      saveAppConfig(); // Save the configuration
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
    // Download assets first, then fetch challenges
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
      console.log('APP_CONFIG.romsPath:', APP_CONFIG.romsPath);
      console.log('APP_CONFIG.challengesPath:', APP_CONFIG.challengesPath);
      console.log('APP_CONFIG.emuhawkPath:', APP_CONFIG.emuhawkPath);

      // Determine ROM filename based on game name
      let romFileName;
      switch (gameData.name.toLowerCase()) {
        case 'castlevania':
          romFileName = 'castlevania.nes';
          break;
        case 'super mario bros':
          romFileName = 'super_mario_bros.nes';
          break;
        default:
          romFileName = `${gameData.name.toLowerCase().replace(/\s+/g, '_')}.nes`;
      }

      console.log('Determined ROM filename:', romFileName);

      // Get ROM path
      const romPath = path.join(APP_CONFIG.romsPath, romFileName);
      console.log('Looking for ROM at:', romPath);
      console.log('ROM exists:', fs.existsSync(romPath));
      
      if (!fs.existsSync(romPath)) {
        const errorMsg = `Failed to launch challenge: Could not find the ${gameData.name} ROM file. Make sure the ROM file is placed in the roms folder and has the right name (${romFileName}).\n\nExpected location: ${romPath}`;
        console.log('ROM ERROR:', errorMsg);
        return { success: false, error: errorMsg };
      }

      // Get Lua script path - use the path from challenges.json if available
      let luaPath;
      if (challengeData.lua) {
        // Use the exact path from challenges.json
        luaPath = path.join(APP_CONFIG.challengesPath, challengeData.lua);
        console.log('Using Lua path from challenges.json:', luaPath);
      } else {
        // Fallback to old path structure
        const gameFolder = gameData.name.toLowerCase().replace(/\s+/g, '_');
        const challengeFolder = challengeData.name.toLowerCase().replace(/\s+/g, '_');
        luaPath = path.join(APP_CONFIG.challengesPath, 'nes', gameFolder, challengeFolder, 'main.lua');
        console.log('Using fallback Lua path:', luaPath);
      }

      console.log('Looking for Lua script at:', luaPath);
      console.log('Lua script exists:', fs.existsSync(luaPath));
      
      if (!fs.existsSync(luaPath)) {
        const errorMsg = `Failed to launch challenge: Could not find the challenge script for ${challengeData.name}.\n\nExpected location: ${luaPath}\n\nPlease click the Refresh button to download the latest challenges.`;
        console.log('LUA ERROR:', errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log('Both ROM and Lua script found, launching EmuHawk...');
      const process = launchEmuHawk(romPath, luaPath);
      
      if (process) {
        console.log('EmuHawk launched successfully');
        return 'success';
      } else {
        // Provide specific error message based on what might have failed
        if (!APP_CONFIG.emuhawkPath) {
          const errorMsg = 'Failed to launch challenge: EmuHawk path not configured. Please click the 🔍 button to auto-detect EmuHawk or use Browse to select EmuHawk.exe manually.';
          console.log('EMUHAWK ERROR (not configured):', errorMsg);
          return { success: false, error: errorMsg };
        } else if (!fs.existsSync(APP_CONFIG.emuhawkPath)) {
          const errorMsg = `Failed to launch challenge: EmuHawk.exe not found at: ${APP_CONFIG.emuhawkPath}\n\nPlease check the path and try again, or use the 🔍 button to auto-detect EmuHawk.`;
          console.log('EMUHAWK ERROR (not found):', errorMsg);
          return { success: false, error: errorMsg };
        } else {
          const errorMsg = 'Failed to launch challenge: Could not start EmuHawk. Please check that EmuHawk.exe is properly installed and try again.';
          console.log('EMUHAWK ERROR (launch failed):', errorMsg);
          return { success: false, error: errorMsg };
        }
      }
    } catch (error) {
      console.log('GENERAL ERROR:', error.message);
      console.log('Error stack:', error.stack);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-user-info', () => {
    return userInfo;
  });

  // Get current EmuHawk path
  ipcMain.handle('get-emuhawk-path', () => {
    return APP_CONFIG.emuhawkPath;
  });

  // Get user data paths
  ipcMain.handle('get-user-data-paths', () => {
    return {
      userDataPath: APP_CONFIG.userDataPath,
      romsPath: APP_CONFIG.romsPath,
      challengesPath: APP_CONFIG.challengesPath,
      configPath: APP_CONFIG.configPath
    };
  });

  // Auto-detect EmuHawk path
  ipcMain.handle('auto-detect-emuhawk', () => {
    const detectedPath = findEmuHawkPath();
    if (detectedPath) {
      APP_CONFIG.emuhawkPath = detectedPath;
      saveAppConfig(); // Save the configuration
      return { success: true, path: detectedPath };
    }
    return { success: false, message: 'EmuHawk not found in common locations' };
  });

  ipcMain.handle('logout', () => {
    clearAuthData();
    return true;
  });

  ipcMain.handle('get-config', () => {
    return {
      emuhawkPath: APP_CONFIG.emuhawkPath
    };
  });

  ipcMain.handle('open-rom-folder', async () => {
    try {
      // Ensure the ROMs directory exists
      ensureRomsDirectory();
      
      // Open the ROMs folder in the system file explorer
      await shell.openPath(APP_CONFIG.romsPath);
      return { success: true, path: APP_CONFIG.romsPath };
    } catch (error) {
      console.error('Error opening ROM folder:', error);
      return { success: false, error: error.message };
    }
  });

}

// App event handlers
app.whenReady().then(async () => {
  loadAppConfig(); // Load saved configuration
  registerIpcHandlers();
  ensureRomsDirectory();
  
  // Send webhook notification that app was launched
  await sendWebhookNotification('🚀 RetroChallenges desktop app has been launched!', 'App Launched');
  
  // Try to load existing authentication
  const authData = await loadAuthData();
  if (authData && authData.user && authData.user.name) {
    // User is already authenticated, go straight to main window
    isAuthenticated = true;
    userInfo = authData.user;
    authTokens = authData.tokens;
    createMainWindow();
  } else {
    // No valid authentication, show main window with sign-in option
    isAuthenticated = false;
    userInfo = null;
    authTokens = null;
    createMainWindow();
  }
  
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
  if (emuProcess) {
    emuProcess.kill();
  }
});
