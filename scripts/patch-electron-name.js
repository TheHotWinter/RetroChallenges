// Patches the Electron binary's Info.plist on macOS so the menu bar
// and dock show "RetroChallenges" instead of "Electron" during development.
// Runs automatically via the postinstall npm hook.

if (process.platform !== 'darwin') {
  process.exit(0);
}

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
// Support both pre-rename and post-rename states
const electronAppDir = fs.existsSync(path.join(distDir, 'Electron.app'))
  ? path.join(distDir, 'Electron.app', 'Contents')
  : path.join(distDir, `${APP_NAME}.app`, 'Contents');

const mainPlist = path.join(electronAppDir, 'Info.plist');

if (!fs.existsSync(mainPlist)) {
  console.log('Electron binary not found, skipping plist patch');
  process.exit(0);
}

const APP_NAME = 'RetroChallenges';

// Patch main app plist
try {
  execSync(`plutil -replace CFBundleName -string "${APP_NAME}" "${mainPlist}"`);
  execSync(`plutil -replace CFBundleDisplayName -string "${APP_NAME}" "${mainPlist}"`);
  console.log(`Patched Electron menu bar name to "${APP_NAME}"`);
} catch (e) {
  console.warn('Failed to patch main Info.plist:', e.message);
}

// Patch helper app plists
const frameworksDir = path.join(electronAppDir, 'Frameworks');
if (fs.existsSync(frameworksDir)) {
  const helpers = fs.readdirSync(frameworksDir)
    .filter(f => f.startsWith('Electron Helper') && f.endsWith('.app'));

  for (const helper of helpers) {
    const helperPlist = path.join(frameworksDir, helper, 'Contents', 'Info.plist');
    if (fs.existsSync(helperPlist)) {
      try {
        const suffix = helper.replace('Electron Helper', '').replace('.app', '');
        const helperName = `${APP_NAME} Helper${suffix}`;
        execSync(`plutil -replace CFBundleName -string "${helperName}" "${helperPlist}"`);
        execSync(`plutil -replace CFBundleDisplayName -string "${helperName}" "${helperPlist}"`);
      } catch (e) {
        console.warn(`Failed to patch ${helper}:`, e.message);
      }
    }
  }
}

// Rename the .app bundle so macOS dock tooltip shows the correct name
const oldAppPath = path.join(distDir, 'Electron.app');
const newAppPath = path.join(distDir, `${APP_NAME}.app`);

if (fs.existsSync(oldAppPath) && !fs.existsSync(newAppPath)) {
  try {
    fs.renameSync(oldAppPath, newAppPath);
    // Update electron's path.txt so it can find the renamed binary
    const pathTxt = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt');
    if (fs.existsSync(pathTxt)) {
      const oldPath = fs.readFileSync(pathTxt, 'utf8').trim();
      const newPath = oldPath.replace('Electron.app', `${APP_NAME}.app`);
      fs.writeFileSync(pathTxt, newPath);
    }
    console.log(`Renamed Electron.app to ${APP_NAME}.app`);
  } catch (e) {
    console.warn('Failed to rename Electron.app:', e.message);
  }
}

console.log('Electron plist patching complete');
