const { BrowserWindow } = require('electron');
const fs = require('fs');
const { httpClient } = require('./http');
const { CONFIG, APP_CONFIG } = require('./config');
const state = require('./state');
const { sendWebhookNotification } = require('./webhook');

async function authenticateWithGoogle() {
  try {
    const SERVER_LOGIN_URL = 'https://retrochallenges.com/public/auth/google/login.php';

    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      parent: state.mainWindow,
      modal: true,
      resizable: false
    });

    await authWindow.loadURL(SERVER_LOGIN_URL);

    return new Promise((resolve) => {
      authWindow.webContents.on('did-finish-load', async () => {
        try {
          const hasUser = await authWindow.webContents.executeJavaScript('typeof window.USER !== "undefined"');
          if (hasUser) {
            const user = await authWindow.webContents.executeJavaScript('window.USER');
            authWindow.close();

            state.isAuthenticated = true;
            state.userInfo = user;
            saveAuthData(user, null);

            await sendWebhookNotification('User successfully authenticated!', 'User Login', true);
            resolve({ success: true, user: user, accessToken: null });
            return;
          }
        } catch (e) {
          // Ignore errors on pages that don't have USER
        }
      });

      authWindow.on('closed', () => {
        resolve({ success: false, error: 'Authentication cancelled' });
      });
    });
  } catch (error) {
    console.error('OAuth authentication error (server-based):', error);
    return { success: false, error: error.message };
  }
}

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

async function loadAuthData() {
  try {
    if (fs.existsSync(APP_CONFIG.authDataPath)) {
      const authData = JSON.parse(fs.readFileSync(APP_CONFIG.authDataPath, 'utf8'));

      if (!authData.user || !authData.user.name || !authData.user.email) {
        console.log('Invalid auth data: missing user information');
        clearAuthData();
        return null;
      }

      if (authData.tokens && authData.tokens.expires_at > Date.now()) {
        return authData;
      } else {
        return await refreshAuthToken(authData.tokens?.refresh_token);
      }
    }
  } catch (error) {
    console.error('Error loading auth data:', error);
    clearAuthData();
  }
  return null;
}

async function refreshAuthToken(refreshToken) {
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await httpClient.post('https://oauth2.googleapis.com/token', {
      client_id: CONFIG.google.clientId,
      client_secret: CONFIG.google.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const { access_token, expires_in } = response.data;

    const userResponse = await httpClient.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const user = {
      name: userResponse.data.name,
      email: userResponse.data.email,
      id: userResponse.data.id,
      picture: userResponse.data.picture
    };

    state.authTokens = {
      access_token,
      refresh_token: refreshToken,
      expires_at: Date.now() + (expires_in * 1000)
    };

    saveAuthData(user, state.authTokens);
    return { user, tokens: state.authTokens };
  } catch (error) {
    console.error('Token refresh failed:', error);
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

function clearAuthData() {
  try {
    if (fs.existsSync(APP_CONFIG.authDataPath)) {
      fs.unlinkSync(APP_CONFIG.authDataPath);
    }
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
  state.isAuthenticated = false;
  state.userInfo = null;
  state.authTokens = null;
}

module.exports = { authenticateWithGoogle, saveAuthData, loadAuthData, clearAuthData };
