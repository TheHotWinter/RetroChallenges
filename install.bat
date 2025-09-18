@echo off
echo 🎮 RetroChallenges - Installation Script
echo ========================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js (v16 or higher) first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js detected

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ npm detected

REM Install dependencies
echo 📦 Installing dependencies...
npm install

if %errorlevel% equ 0 (
    echo ✅ Dependencies installed successfully!
) else (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

REM Create assets directory if it doesn't exist
if not exist "assets" (
    mkdir assets
    echo 📁 Created assets directory
)

echo.
echo 🎉 Installation complete!
echo.
echo To start the application, run:
echo   npm start
echo.
echo To build for distribution, run:
echo   npm run build
echo.
echo Make sure to:
echo 1. Configure your webhook URL in the app
echo 2. Select your EmuHawk.exe path
echo 3. Select your Lua script file
echo.
echo Happy retro gaming! 🎮
pause
