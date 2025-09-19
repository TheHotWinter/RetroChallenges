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

// App configuration
const APP_CONFIG = {
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

// Download assets from GitHub repository recursively
async function downloadAssetsFromRepo() {
  try {
    const baseRepoUrl = 'https://api.github.com/repos/mattd1980/retrochallenges-assets/contents';
    
    // Recursive function to download files and folders
    async function downloadRecursive(repoPath = '', localPath = '') {
      const url = repoPath ? `${baseRepoUrl}/${repoPath}` : baseRepoUrl;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'RetroChallenges-App/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      const items = response.data;
      
      for (const item of items) {
        // Skip README.md files
        if (item.name === 'README.md') {
          continue;
        }
        
        if (item.type === 'dir') {
          // Recursively download directory contents
          console.log(`Processing directory: ${item.name}`);
          await downloadRecursive(item.path, localPath);
        } else {
          // Determine target directory based on file path and type
          let targetDir;
          let fileName = item.name;
          
          if (repoPath.includes('/nes/')) {
            // NES game files - preserve exact structure: nes/[game-name]/[challenge-name]/
            const pathParts = repoPath.split('/');
            const nesIndex = pathParts.indexOf('nes');
            if (nesIndex !== -1 && pathParts.length > nesIndex + 2) {
              const gameName = pathParts[nesIndex + 1];
              const challengeName = pathParts[nesIndex + 2];
              
              if (item.name === 'main.lua') {
                // Keep main.lua as main.lua in the challenge folder
                fileName = 'main.lua';
                targetDir = path.join(__dirname, 'challenges', 'nes', gameName, challengeName);
              } else {
                // Other files go to their respective subfolders (assets/, savestates/, etc.)
                const remainingPath = pathParts.slice(nesIndex + 3).join('/');
                if (remainingPath) {
                  targetDir = path.join(__dirname, 'challenges', 'nes', gameName, challengeName, remainingPath);
                } else {
                  targetDir = path.join(__dirname, 'challenges', 'nes', gameName, challengeName);
                }
              }
            } else {
              // Fallback for files in nes root
              targetDir = path.join(__dirname, 'challenges', 'nes');
            }
          } else if (repoPath.includes('/utils/')) {
            // Utility scripts go to utils folder
            targetDir = path.join(__dirname, 'challenges', 'utils');
          } else if (repoPath.includes('/assets/')) {
            // Generic assets
            targetDir = path.join(__dirname, 'challenges', 'assets');
          } else if (repoPath.includes('/snes/')) {
            // SNES challenges
            const pathParts = repoPath.split('/');
            const snesIndex = pathParts.indexOf('snes');
            if (snesIndex !== -1 && pathParts.length > snesIndex + 2) {
              const gameName = pathParts[snesIndex + 1];
              const challengeName = pathParts[snesIndex + 2];
              const remainingPath = pathParts.slice(snesIndex + 3).join('/');
              if (remainingPath) {
                targetDir = path.join(__dirname, 'challenges', 'snes', gameName, challengeName, remainingPath);
              } else {
                targetDir = path.join(__dirname, 'challenges', 'snes', gameName, challengeName);
              }
            } else {
              targetDir = path.join(__dirname, 'challenges', 'snes');
            }
          } else if (item.name === 'challenges.json') {
            // challenges.json goes to root of challenges folder
            targetDir = path.join(__dirname, 'challenges');
          } else {
            // Default to challenges root
            targetDir = path.join(__dirname, 'challenges');
          }
          
          // Ensure target directory exists
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          
          // Download file
          const filePath = path.join(targetDir, fileName);
          
          // Handle different content types
          if (item.content) {
            // File content is base64 encoded in the API response
            const content = Buffer.from(item.content, 'base64');
            fs.writeFileSync(filePath, content);
          } else if (item.download_url) {
            // Download file content directly
            const fileResponse = await axios.get(item.download_url, {
              headers: {
                'User-Agent': 'RetroChallenges-App/1.0'
              },
              responseType: 'arraybuffer'
            });
            
            fs.writeFileSync(filePath, Buffer.from(fileResponse.data));
          }
          
          console.log(`Downloaded: ${fileName} to ${targetDir}`);
        }
      }
    }
    
    // Start recursive download from root
    await downloadRecursive();
    
    return { success: true, message: 'Assets downloaded successfully with proper structure' };
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
      return result.filePaths[0];
    }
    return null;
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
      // Get ROM path
      const romPath = path.join(APP_CONFIG.romsPath, gameData.rom);
      if (!fs.existsSync(romPath)) {
        throw new Error(`ROM file not found: ${gameData.rom}. Please add it to the roms folder.`);
      }

      // Get Lua script path (assuming it's in challenges/nes/[game]/[challenge]/main.lua)
      const luaPath = path.join(__dirname, 'challenges', 'nes', gameData.name.toLowerCase().replace(/\s+/g, '_'), challengeData.name.toLowerCase().replace(/\s+/g, '_'), 'main.lua');
      if (!fs.existsSync(luaPath)) {
        throw new Error(`Lua script not found: ${challengeData.lua}. Please refresh challenges to download it.`);
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
      emuhawkPath: APP_CONFIG.emuhawkPath
    };
  });

  ipcMain.handle('open-rom-folder', async () => {
    try {
      // Ensure the ROMs directory exists
      ensureRomsDirectory();
      
      // Open the ROMs folder in the system file explorer
      shell.openPath(APP_CONFIG.romsPath);
    } catch (error) {
      console.error('Error opening ROM folder:', error);
      throw error;
    }
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
