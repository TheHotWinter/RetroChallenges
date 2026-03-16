#!/usr/bin/env node
// Debug script to test EmuHawk launch flow without the Electron UI.
// Usage: node scripts/debug-launch.js

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const userDataPath = isMac
  ? path.join(process.env.HOME, 'Library', 'Application Support', 'RetroChallenges')
  : isWindows
    ? path.join(process.env.APPDATA, 'RetroChallenges')
    : path.join(process.env.HOME, '.config', 'RetroChallenges');

console.log('=== RetroChallenges Debug Launch ===');
console.log('Platform:', process.platform, process.arch);
console.log('User data:', userDataPath);

// Check BizHawk
const bizhawkPath = path.join(userDataPath, 'bizhawk');
console.log('\n--- BizHawk ---');
if (fs.existsSync(bizhawkPath)) {
  const files = fs.readdirSync(bizhawkPath).filter(f => f.includes('EmuHawk'));
  console.log('BizHawk installed:', bizhawkPath);
  console.log('EmuHawk files:', files);
} else {
  console.log('BizHawk NOT installed');
  process.exit(1);
}

// Check Mono (non-Windows)
if (!isWindows) {
  console.log('\n--- Mono ---');
  const monoPaths = [
    '/Library/Frameworks/Mono.framework/Versions/Current/bin/mono',
    '/usr/local/bin/mono',
    '/opt/homebrew/bin/mono'
  ];
  let monoPath = null;
  try {
    monoPath = execSync('which mono', { encoding: 'utf8' }).trim();
  } catch {
    monoPath = monoPaths.find(p => fs.existsSync(p)) || null;
  }

  if (monoPath) {
    console.log('Mono found:', monoPath);
    const version = execSync(`"${monoPath}" --version`, { encoding: 'utf8' }).split('\n')[0];
    console.log('Mono version:', version);
  } else {
    console.log('Mono NOT found');
    process.exit(1);
  }

  // Test direct mono launch
  console.log('\n--- Test Launch ---');
  const emuHawkExe = path.join(bizhawkPath, 'EmuHawk.exe');
  if (!fs.existsSync(emuHawkExe)) {
    console.log('EmuHawk.exe not found at:', emuHawkExe);
    process.exit(1);
  }

  console.log('Running: mono EmuHawk.exe --help');
  try {
    const output = execSync(`"${monoPath}" "${emuHawkExe}" --help`, {
      encoding: 'utf8',
      cwd: bizhawkPath,
      timeout: 10000,
      env: { ...process.env, PATH: `${path.dirname(monoPath)}:${process.env.PATH}` }
    });
    console.log('SUCCESS - EmuHawk responds to --help');
    console.log(output.split('\n').slice(0, 5).join('\n'));
  } catch (e) {
    console.log('FAILED:', e.message);
    if (e.stderr) console.log('stderr:', e.stderr);
  }
}

// Check challenges
console.log('\n--- Challenges ---');
const challengesPath = path.join(userDataPath, 'challenges');
const challengesJson = path.join(challengesPath, 'challenges.json');
if (fs.existsSync(challengesJson)) {
  const data = JSON.parse(fs.readFileSync(challengesJson, 'utf8'));
  console.log('Challenges loaded:', data.games?.length, 'games');
  data.games?.forEach(g => {
    console.log(`  ${g.name}: ${g.challenges.length} challenges`);
    g.challenges.forEach(c => {
      const luaPath = path.join(challengesPath, ...c.lua.replace(/\\/g, '/').split('/'));
      console.log(`    - ${c.name}: ${fs.existsSync(luaPath) ? 'OK' : 'MISSING'} (${luaPath})`);
    });
  });
} else {
  console.log('challenges.json not found');
}

// Check ROMs
console.log('\n--- ROMs ---');
const romsPath = path.join(userDataPath, 'roms');
if (fs.existsSync(romsPath)) {
  const roms = fs.readdirSync(romsPath);
  console.log('ROMs directory:', romsPath);
  console.log('ROM files:', roms.length ? roms : '(empty)');
} else {
  console.log('ROMs directory not found');
}

// Check config
console.log('\n--- Config ---');
const configPath = path.join(userDataPath, 'app_config.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('Config:', JSON.stringify(config, null, 2));
  if (config.emuhawkPath) {
    console.log('EmuHawk path exists:', fs.existsSync(config.emuhawkPath));
  }
} else {
  console.log('No config file');
}

console.log('\n=== Debug Complete ===');
