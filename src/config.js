const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Load configuration from config.json
let CONFIG = {};
try {
  CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
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
  userDataPath: app.getPath('userData'),
  jsonOutputPath: path.join(app.getPath('userData'), 'challenge_data.json'),
  romsPath: path.join(app.getPath('userData'), 'roms'),
  challengesPath: path.join(app.getPath('userData'), 'challenges'),
  authDataPath: path.join(app.getPath('userData'), 'auth_data.json'),
  configPath: path.join(app.getPath('userData'), 'app_config.json'),
  bizhawkPath: path.join(app.getPath('userData'), 'bizhawk')
};

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1419125129111277578/Zm-DL3Vl1UPdEtU4SEY9yJwPez7ysbQWOMEt5Jgy8gVLlO4DdHV1KfQ4KRuM9KWR9DDQ';

// Load/save app configuration
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

module.exports = { CONFIG, APP_CONFIG, DISCORD_WEBHOOK_URL, loadAppConfig, saveAppConfig };
