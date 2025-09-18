#!/bin/bash

echo "🎮 RetroChallenges - Installation Script"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v16 or higher) first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create assets directory if it doesn't exist
if [ ! -d "assets" ]; then
    mkdir assets
    echo "📁 Created assets directory"
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "To start the application, run:"
echo "  npm start"
echo ""
echo "To build for distribution, run:"
echo "  npm run build"
echo ""
echo "Make sure to:"
echo "1. Configure your webhook URL in the app"
echo "2. Select your EmuHawk.exe path"
echo "3. Select your Lua script file"
echo ""
echo "Happy retro gaming! 🎮"
