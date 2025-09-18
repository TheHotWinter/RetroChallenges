# 🎮 NES Challenge - Retro Gaming Platform

A modern Electron-based desktop application for retro gaming challenges with Google OAuth authentication and EmuHawk emulator integration.

## ✨ Features

- 🔐 **Google OAuth Authentication** - Secure login with your Google account
- 🎯 **Challenge System** - Pre-defined gaming challenges for retro games
- 🕹️ **EmuHawk Integration** - Launch games with custom Lua scripts
- 📊 **Progress Tracking** - Monitor challenge completion and send data to webhooks
- 🎨 **Modern UI** - Beautiful, responsive interface built with HTML/CSS/JavaScript
- 🔧 **Cross-Platform** - Works on Windows, macOS, and Linux

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- EmuHawk emulator
- Google Cloud Console project with OAuth credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/nes-challenge.git
   cd nes-challenge
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Google OAuth**
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Google+ API
   - Create OAuth 2.0 credentials (Desktop application)
   - Update `config.json` with your credentials:
   ```json
   {
     "google": {
       "clientId": "your-client-id",
       "clientSecret": "your-client-secret",
       "redirectUri": "urn:ietf:wg:oauth:2.0:oob"
     },
     "challenges": {
       "url": "https://retrochallenges.com/challenges/challenges.json"
     }
   }
   ```

4. **Add ROM files**
   - Place your NES ROM files in the `roms/` directory
   - Supported formats: `.nes`, `.rom`

5. **Configure EmuHawk**
   - Download and install [EmuHawk](https://tasvideos.org/EmuHawk.html)
   - Use the app's file browser to select your EmuHawk.exe

6. **Launch the application**
   ```bash
   npm start
   ```

## 🎯 How to Use

1. **Authentication**
   - Launch the app
   - Click "Sign in with Google"
   - Complete OAuth flow in the browser window

2. **Configure EmuHawk**
   - Click "Browse" next to EmuHawk Configuration
   - Select your EmuHawk.exe file

3. **Set up Webhook (Optional)**
   - Enter your webhook URL for challenge completion tracking
   - Click "Save Webhook URL"

4. **Launch Challenges**
   - Select a game from the available challenges
   - Choose a specific challenge
   - Click "Launch Challenge"
   - EmuHawk will open with the ROM and Lua script loaded

## 📁 Project Structure

```
nes-challenge/
├── assets/                 # App icons and images
├── roms/                  # ROM files (user-added)
├── scripts/               # Lua challenge scripts
├── auth.html              # Authentication window
├── index.html             # Main application window
├── main.js                # Electron main process
├── config.json            # OAuth and app configuration
├── package.json           # Node.js dependencies
└── README.md              # This file
```

## 🔧 Configuration

### Google OAuth Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one

2. **Enable APIs**
   - Enable Google+ API
   - Enable Google OAuth2 API

3. **Create OAuth Credentials**
   - Go to APIs & Services → Credentials
   - Create OAuth 2.0 Client ID
   - Application type: Desktop application
   - Add redirect URI: `urn:ietf:wg:oauth:2.0:oob`

4. **Configure OAuth Consent Screen**
   - Set user type to "External"
   - Add required scopes: `openid`, `email`, `profile`
   - Publish the app

### Challenge Scripts

Lua scripts in the `scripts/` directory define challenge objectives:

```lua
-- Example: Mario 5 1ups challenge
local function check1ups()
    local lives = memory.readbyte(0x075A)
    if lives >= 5 then
        -- Challenge completed!
        local data = {
            username = "player",
            game = "Super Mario Bros",
            challengeName = "Get 5 1ups!",
            date = os.date("!%Y-%m-%dT%H:%M:%SZ")
        }
        -- Write to challenge_data.json
    end
end
```

## 🛠️ Development

### Building from Source

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Create distributable
npm run dist
```

### Adding New Challenges

1. **Add ROM file** to `roms/` directory
2. **Create Lua script** in `scripts/` directory
3. **Update challenges data** (local or remote JSON)

## 📋 Available Challenges

- **Castlevania**
  - Get 5000 points!
  - Kill Dracula!

- **Super Mario Bros**
  - Get 5 1ups!
  - Speed Run Level 1

## 🔒 Security

- OAuth 2.0 authentication with Google
- Secure token exchange
- No stored credentials
- HTTPS communication with Google APIs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [EmuHawk](https://tasvideos.org/EmuHawk.html) - NES emulator
- [Electron](https://electronjs.org/) - Desktop app framework
- [Google OAuth](https://developers.google.com/identity/protocols/oauth2) - Authentication

## 📞 Support

If you encounter any issues:

1. Check the [Issues](https://github.com/yourusername/nes-challenge/issues) page
2. Create a new issue with detailed information
3. Include error messages and steps to reproduce

---

**Happy Gaming! 🎮**