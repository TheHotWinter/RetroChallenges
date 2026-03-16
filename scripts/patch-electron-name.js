// Patches the Electron binary's Info.plist on macOS so the menu bar
// and dock show "RetroChallenges" instead of "Electron" during development.
// Runs automatically via the postinstall npm hook.

if (process.platform !== 'darwin') {
  process.exit(0);
}

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const electronAppDir = path.join(
  __dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents'
);

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

console.log('Electron plist patching complete');
