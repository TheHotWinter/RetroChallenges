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
      url: 'https://retrochallenges.com/challenges/challenges.json'
    }
  };
}

// Allow overriding sensitive values via environment variables (useful for CI or local envs)
// Example env names: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, CHALLENGES_URL, WEBHOOK_URL
CONFIG.google = CONFIG.google || {};
CONFIG.google.clientId = process.env.GOOGLE_CLIENT_ID || CONFIG.google.clientId;
CONFIG.google.clientSecret = process.env.GOOGLE_CLIENT_SECRET || CONFIG.google.clientSecret;
CONFIG.google.redirectUri = process.env.GOOGLE_REDIRECT_URI || CONFIG.google.redirectUri;
CONFIG.challenges = CONFIG.challenges || {};
CONFIG.challenges.url = process.env.CHALLENGES_URL || CONFIG.challenges.url;


// App configuration
const APP_CONFIG = {
  webhookUrl: 'https://your-webhook-url.com', // Replace with actual webhook URL
  emuhawkPath: '', // Will be set by user
  challengesUrl: CONFIG.challenges.url,
  // Use userData (writable) locations for files and directories so packaged apps don't write inside the ASAR
  jsonOutputPath: path.join(app.getPath('userData'), 'challenge_data.json'),
  romsPath: path.join(app.getPath('userData'), 'roms'), // Directory for ROM files
  authDataPath: path.join(app.getPath('userData'), 'auth_data.json') // File to store authentication data
};

let mainWindow;
let emuProcess = null;
let isAuthenticated = false;
let userInfo = null;
let challengesData = null;
let authTokens = null; // Store access and refresh tokens

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
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'RetroChallenges'
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
}

function createAuthWindow() {
  const authWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    parent: mainWindow,
    modal: true,
    resizable: false
  });

  authWindow.loadFile('auth.html');
  
  authWindow.on('closed', () => {
    if (!isAuthenticated) {
      app.quit();
    } else {
      // Create main window after successful authentication
      createMainWindow();
    }
  });
}

// Google OAuth implementation - Real OAuth flow with browser window
async function authenticateWithGoogle() {
  try {
    // Create OAuth URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${CONFIG.google.clientId}&` +
      `redirect_uri=${encodeURIComponent(CONFIG.google.redirectUri)}&` +
      `response_type=code&` +
      `scope=openid%20email%20profile&` +
      `access_type=offline`;
    
    // Create a new browser window for OAuth
    const authWindow = new BrowserWindow({
      width: 500,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      parent: mainWindow,
      modal: true,
      resizable: false
    });
    
    // Load the OAuth URL
    await authWindow.loadURL(authUrl);
    
    // Handle the OAuth callback
    return new Promise((resolve) => {
      authWindow.webContents.on('will-redirect', (event, url) => {
        // Check if this is the callback URL
        if (url.includes('code=')) {
          // Extract the authorization code
          const urlParams = new URLSearchParams(url.split('?')[1]);
          const code = urlParams.get('code');
          
          if (code) {
            
            // Exchange code for tokens and get user info
            exchangeCodeForTokens(code, CONFIG.google.clientId)
              .then(result => {
                authWindow.close();
                resolve(result);
              })
              .catch(error => {
                console.error('Token exchange failed:', error);
                authWindow.close();
                resolve({ success: false, error: error.message });
              });
          } else {
            console.error('No authorization code found in URL');
            authWindow.close();
            resolve({ success: false, error: 'No authorization code received' });
          }
        }
      });
      
      // Handle window close
      authWindow.on('closed', () => {
        resolve({ success: false, error: 'Authentication cancelled' });
      });
    });
    
  } catch (error) {
    console.error('OAuth authentication error:', error);
    return { success: false, error: error.message };
  }
}

// Exchange authorization code for access token
async function exchangeCodeForTokens(code, clientId) {
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: CONFIG.google.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: CONFIG.google.redirectUri
    });

    const { access_token, refresh_token, expires_in } = response.data;

    // Get user info from Google API
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

    // Store tokens for persistence
    authTokens = {
      access_token,
      refresh_token,
      expires_at: Date.now() + (expires_in * 1000)
    };
    
    // Save authentication data to file
    saveAuthData(user, authTokens);

    return {
      success: true,
      user: user,
      accessToken: access_token
    };
  } catch (error) {
    console.error('Token exchange failed:', error.response?.data || error.message);
    throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
  }
}

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

// Launch EmuHawk with ROM and Lua script
function launchEmuHawk(romPath, luaScriptPath) {
  if (!APP_CONFIG.emuhawkPath) {
    dialog.showErrorBox('Error', 'EmuHawk path not configured. Please select EmuHawk.exe first.');
    return;
  }

  if (!romPath || !fs.existsSync(romPath)) {
    dialog.showErrorBox('Error', 'ROM file not found. Please ensure the ROM file exists.');
    return;
  }

  if (!luaScriptPath || !fs.existsSync(luaScriptPath)) {
    dialog.showErrorBox('Error', 'Lua script not found. Please ensure the Lua script exists.');
    return;
  }

  if (emuProcess) {
    emuProcess.kill();
  }

  // EmuHawk command line arguments for minimal UI
  const args = [
    '--nogui',           // Disable GUI
    '--loadrom', romPath, // Load ROM file
    '--loadlua', luaScriptPath,  // Load Lua script
    '--autostart',       // Auto start
    '--nowindow'         // No window (if supported)
  ];

  emuProcess = spawn(APP_CONFIG.emuhawkPath, args, {
    detached: true,
    stdio: 'ignore'
  });

  emuProcess.on('error', (error) => {
    console.error('EmuHawk error:', error);
    dialog.showErrorBox('EmuHawk Error', `Failed to launch EmuHawk: ${error.message}`);
  });

  emuProcess.on('close', (code) => {
    emuProcess = null;
  });

  return emuProcess;
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
          
          
          // Send to webhook
          await sendToWebhook(data);
          
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

// Send data to webhook
async function sendToWebhook(data) {
  try {
    const response = await axios.post(APP_CONFIG.webhookUrl, {
      ...data,
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion()
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    return true;
  } catch (error) {
    console.error('Webhook error:', error.message);
    return false;
  }
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
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('fetch-challenges', async () => {
    return await fetchChallenges();
  });

  ipcMain.handle('select-rom-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select ROM File',
      filters: [
        { name: 'NES ROM Files', extensions: ['nes'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('get-rom-path', (event, romFileName) => {
    const romPath = path.join(APP_CONFIG.romsPath, romFileName);
    return fs.existsSync(romPath) ? romPath : null;
  });

  ipcMain.handle('launch-challenge', async (event, gameData, challengeData) => {
    try {
      // Get ROM path
      const romPath = path.join(APP_CONFIG.romsPath, gameData.rom);
      if (!fs.existsSync(romPath)) {
        throw new Error(`ROM file not found: ${gameData.rom}. Please add it to the roms folder.`);
      }

      // Get Lua script path (assuming it's in a scripts folder)
      const luaPath = path.join(__dirname, 'scripts', challengeData.lua);
      if (!fs.existsSync(luaPath)) {
        throw new Error(`Lua script not found: ${challengeData.lua}. Please add it to the scripts folder.`);
      }

      const process = launchEmuHawk(romPath, luaPath);
      return process ? 'success' : 'failed';
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('get-user-info', () => {
    return userInfo;
  });

  ipcMain.handle('logout', () => {
    clearAuthData();
    return true;
  });

  ipcMain.handle('get-config', () => {
    return {
      emuhawkPath: APP_CONFIG.emuhawkPath,
      luaScriptPath: APP_CONFIG.luaScriptPath,
      webhookUrl: APP_CONFIG.webhookUrl
    };
  });

  ipcMain.handle('set-webhook-url', (event, url) => {
    APP_CONFIG.webhookUrl = url;
    return true;
  });
}

// App event handlers
app.whenReady().then(async () => {
  registerIpcHandlers();
  ensureRomsDirectory();
  
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
