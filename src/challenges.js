const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { APP_CONFIG } = require('./config');
const state = require('./state');

async function fetchChallenges() {
  try {
    // Try to load from local file first (for development)
    const localChallengesPath = path.join(__dirname, '..', 'challenges.json');
    if (fs.existsSync(localChallengesPath)) {
      console.log('Loading challenges from local file:', localChallengesPath);
      state.challengesData = JSON.parse(fs.readFileSync(localChallengesPath, 'utf8'));
      return state.challengesData;
    }

    // Fallback to remote URL
    console.log('Loading challenges from remote URL:', APP_CONFIG.challengesUrl);
    const response = await axios.get(APP_CONFIG.challengesUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'RetroChallenges-App/1.0' }
    });

    state.challengesData = response.data;
    return state.challengesData;
  } catch (error) {
    console.error('Error fetching challenges:', error.message);
    // Return mock data if fetch fails
    state.challengesData = {
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
    return state.challengesData;
  }
}

async function downloadAssetsFromRepo() {
  try {
    const AdmZip = require('adm-zip');
    const releaseUrl = 'https://github.com/mattd1980/retrochallenges-assets/archive/refs/heads/main.zip';

    console.log('Downloading assets from GitHub release...');
    const response = await axios.get(releaseUrl, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'RetroChallenges-App/1.0' }
    });

    const challengesDir = APP_CONFIG.challengesPath;
    if (fs.existsSync(challengesDir)) {
      fs.rmSync(challengesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(challengesDir, { recursive: true });

    const zipPath = path.join(APP_CONFIG.userDataPath, 'temp-assets.zip');
    fs.writeFileSync(zipPath, response.data);

    const zip = new AdmZip(zipPath);
    const extractPath = path.join(APP_CONFIG.userDataPath, 'temp-extract');
    zip.extractAllTo(extractPath, true);

    const extractedFolders = fs.readdirSync(extractPath);
    const assetsFolder = extractedFolders.find(folder => folder.startsWith('retrochallenges-assets'));

    if (!assetsFolder) {
      throw new Error('Could not find extracted assets folder');
    }

    const sourcePath = path.join(extractPath, assetsFolder);
    const files = fs.readdirSync(sourcePath);

    for (const file of files) {
      const sourceFile = path.join(sourcePath, file);
      const targetFile = path.join(challengesDir, file);

      if (fs.statSync(sourceFile).isDirectory()) {
        fs.cpSync(sourceFile, targetFile, { recursive: true });
      } else {
        fs.copyFileSync(sourceFile, targetFile);
      }
    }

    fs.rmSync(zipPath);
    fs.rmSync(extractPath, { recursive: true, force: true });

    console.log('Assets downloaded and extracted successfully');
    return { success: true, message: 'Assets downloaded successfully from GitHub release' };
  } catch (error) {
    console.error('Error downloading assets:', error.message);
    return { success: false, error: error.message };
  }
}

function ensureRomsDirectory() {
  try {
    if (!fs.existsSync(APP_CONFIG.romsPath)) {
      fs.mkdirSync(APP_CONFIG.romsPath, { recursive: true });
    }
  } catch (error) {
    console.error('Error creating ROMs directory:', error);
  }
}

function monitorJsonFile() {
  if (!fs.existsSync(APP_CONFIG.jsonOutputPath)) {
    fs.writeFileSync(APP_CONFIG.jsonOutputPath, JSON.stringify({}));
  }

  fs.watchFile(APP_CONFIG.jsonOutputPath, async (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      try {
        const data = JSON.parse(fs.readFileSync(APP_CONFIG.jsonOutputPath, 'utf8'));

        if (data.username && data.game && data.challengeName) {
          if (!data.date) {
            data.date = new Date().toISOString();
          }

          console.log('Challenge completed:', data);

          if (state.mainWindow) {
            state.mainWindow.webContents.send('challenge-completed', data);
          }
        }
      } catch (error) {
        console.error('Error processing JSON file:', error);
      }
    }
  });
}

module.exports = { fetchChallenges, downloadAssetsFromRepo, ensureRomsDirectory, monitorJsonFile };
