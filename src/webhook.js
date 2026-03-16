const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { APP_CONFIG, DISCORD_WEBHOOK_URL } = require('./config');
const state = require('./state');

async function sendWebhookNotification(message, title = 'RetroChallenges App', includeUserInfo = false) {
  if (!DISCORD_WEBHOOK_URL || !state.telemetryEnabled) {
    return;
  }

  try {
    let embedDescription = message;
    let embedColor = 0x00ff00;

    if (includeUserInfo && state.userInfo) {
      embedDescription += `\n\n**User Information:**`;
      embedDescription += `\n* **Name:** ${state.userInfo.name}`;
      embedDescription += `\n* **Email:** ${state.userInfo.email}`;
      embedDescription += `\n* **User ID:** ${state.userInfo.id}`;
      embedDescription += `\n* **Auth Status:** ${state.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}`;

      embedDescription += `\n\n**App Configuration:**`;
      embedDescription += `\n* **EmuHawk Path:** ${APP_CONFIG.emuhawkPath ? 'Configured' : 'Not Set'}`;
      embedDescription += `\n* **Challenges Path:** ${APP_CONFIG.challengesPath}`;
      embedDescription += `\n* **ROMs Path:** ${APP_CONFIG.romsPath}`;

      const emuhawkName = process.platform === 'win32' ? 'EmuHawk.exe' : 'EmuHawkMono.sh';
      const bizhawkInstalled = fs.existsSync(path.join(APP_CONFIG.bizhawkPath, emuhawkName));
      embedDescription += `\n* **BizHawk Installed:** ${bizhawkInstalled ? 'Yes' : 'No'}`;

      if (state.challengesData && state.challengesData.games) {
        const totalChallenges = state.challengesData.games.reduce((sum, game) => sum + game.challenges.length, 0);
        embedDescription += `\n* **Available Games:** ${state.challengesData.games.length}`;
        embedDescription += `\n* **Total Challenges:** ${totalChallenges}`;
      } else {
        embedDescription += `\n* **Challenges:** Not Loaded`;
      }

      embedDescription += `\n\n**System Info:**`;
      embedDescription += `\n* **Platform:** ${process.platform}`;
      embedDescription += `\n* **Architecture:** ${process.arch}`;
      embedDescription += `\n* **Node Version:** ${process.version}`;
      embedDescription += `\n* **App Version:** ${app.getVersion()}`;

      embedColor = 0x0099ff;
    }

    const webhookData = {
      username: 'RetroChallenges Bot',
      avatar_url: 'https://retrochallenges.com/assets/icon.png',
      embeds: [{
        title: title,
        description: embedDescription,
        color: embedColor,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'RetroChallenges Desktop App'
        }
      }]
    };

    await axios.post(DISCORD_WEBHOOK_URL, webhookData, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Webhook notification sent successfully');
  } catch (error) {
    console.error('Error sending webhook notification:', error.message);
  }
}

module.exports = { sendWebhookNotification };
