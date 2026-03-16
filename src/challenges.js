const path = require('path');
const fs = require('fs');
const { httpClient } = require('./http');
const { APP_CONFIG } = require('./config');
const state = require('./state');

function validateChallengesData(data) {
  if (!data || !Array.isArray(data.games)) {
    return false;
  }
  return data.games.every(game =>
    typeof game.name === 'string' &&
    Array.isArray(game.challenges) &&
    game.challenges.every(c =>
      typeof c.name === 'string' && typeof c.lua === 'string'
    )
  );
}

async function fetchChallenges() {
  try {
    // Load from downloaded assets directory (populated by downloadAssetsFromRepo)
    const downloadedPath = path.join(APP_CONFIG.challengesPath, 'challenges.json');
    if (fs.existsSync(downloadedPath)) {
      console.log('Loading challenges from downloaded assets:', downloadedPath);
      const parsed = JSON.parse(fs.readFileSync(downloadedPath, 'utf8'));
      if (!validateChallengesData(parsed)) {
        console.error('Invalid challenges data structure in downloaded file');
        state.challengesData = { games: [] };
        return state.challengesData;
      }
      state.challengesData = parsed;
      return state.challengesData;
    }

    // Fallback to remote URL if assets haven't been downloaded yet
    console.log('Loading challenges from remote URL:', APP_CONFIG.challengesUrl);
    const response = await httpClient.get(APP_CONFIG.challengesUrl, {
      timeout: 10000
    });

    if (!validateChallengesData(response.data)) {
      console.error('Invalid challenges data structure from remote URL');
      state.challengesData = { games: [] };
      return state.challengesData;
    }

    state.challengesData = response.data;
    return state.challengesData;
  } catch (error) {
    console.error('Error fetching challenges:', error.message);
    state.challengesData = { games: [] };
    return state.challengesData;
  }
}

async function downloadAssetsFromRepo() {
  try {
    const AdmZip = require('adm-zip');
    const releaseUrl = 'https://github.com/mattd1980/retrochallenges-assets/archive/refs/heads/main.zip';

    console.log('Downloading assets from GitHub release...');
    const response = await httpClient.get(releaseUrl, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'RetroChallenges-App/1.0' },
      onDownloadProgress: (progressEvent) => {
        if (state.mainWindow && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          state.mainWindow.webContents.send('download-progress', {
            type: 'assets',
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percent
          });
        }
      }
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

function stopMonitoringJsonFile() {
  fs.unwatchFile(APP_CONFIG.jsonOutputPath);
}

module.exports = { fetchChallenges, downloadAssetsFromRepo, ensureRomsDirectory, monitorJsonFile, stopMonitoringJsonFile };
