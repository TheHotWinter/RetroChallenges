jest.mock('electron');
jest.mock('../src/http', () => ({
  httpClient: { get: jest.fn() }
}));
jest.mock('../src/webhook', () => ({
  sendWebhookNotification: jest.fn()
}));
jest.mock('../src/auth', () => ({
  authenticateWithGoogle: jest.fn(),
  clearAuthData: jest.fn()
}));
jest.mock('../src/bizhawk', () => ({
  downloadBizHawk: jest.fn(),
  forceDownloadBizHawk: jest.fn(),
  findEmuHawkPath: jest.fn(),
  launchEmuHawk: jest.fn()
}));
jest.mock('../src/challenges', () => ({
  fetchChallenges: jest.fn(),
  downloadAssetsFromRepo: jest.fn(),
  ensureRomsDirectory: jest.fn()
}));

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { APP_CONFIG } = require('../src/config');
const state = require('../src/state');
const { launchEmuHawk, findEmuHawkPath } = require('../src/bizhawk');
const { fetchChallenges, downloadAssetsFromRepo } = require('../src/challenges');
const { registerIpcHandlers } = require('../src/ipc');

// Collect registered handlers
let handlers = {};
beforeAll(() => {
  ipcMain.handle.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });
  registerIpcHandlers();
});

beforeEach(() => {
  state.isAuthenticated = false;
  state.userInfo = null;
  state.telemetryEnabled = false;
  launchEmuHawk.mockReset();
  findEmuHawkPath.mockReset();
  fetchChallenges.mockReset();
  downloadAssetsFromRepo.mockReset();
  jest.restoreAllMocks();
});

describe('launch-challenge', () => {
  const gameData = { name: 'Castlevania', rom: 'roms\\castlevania.nes' };
  const challengeData = { name: 'Get 5000 points!', lua: 'nes\\castlevania\\5000pts.lua' };

  test('returns error when ROM file not found', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = await handlers['launch-challenge']({}, gameData, challengeData);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ROM file');
  });

  test('returns error when Lua script not found', async () => {
    // ROM exists, Lua doesn't
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return p.includes('castlevania.nes');
    });

    const result = await handlers['launch-challenge']({}, gameData, challengeData);

    expect(result.success).toBe(false);
    expect(result.error).toContain('challenge script');
  });

  test('returns success true when launch succeeds', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    launchEmuHawk.mockReturnValue(true);

    const result = await handlers['launch-challenge']({}, gameData, challengeData);

    expect(result).toEqual({ success: true });
  });

  test('uses rom field from gameData', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    launchEmuHawk.mockReturnValue(true);

    await handlers['launch-challenge']({}, gameData, challengeData);

    const romArg = launchEmuHawk.mock.calls[0][0];
    expect(romArg).toContain('castlevania.nes');
  });

  test('falls back to name-based ROM when rom field missing', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    launchEmuHawk.mockReturnValue(true);

    const noRomGame = { name: 'Super Mario Bros' };
    await handlers['launch-challenge']({}, noRomGame, challengeData);

    const romArg = launchEmuHawk.mock.calls[0][0];
    expect(romArg).toContain('super_mario_bros.nes');
  });

  test('returns error when EmuHawk not configured', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    launchEmuHawk.mockReturnValue(false);
    APP_CONFIG.emuhawkPath = '';

    const result = await handlers['launch-challenge']({}, gameData, challengeData);

    expect(result.success).toBe(false);
    expect(result.error).toContain('EmuHawk path not configured');
  });
});

describe('auto-detect-emuhawk', () => {
  test('returns success when EmuHawk found', () => {
    findEmuHawkPath.mockReturnValue('C:\\BizHawk\\EmuHawk.exe');
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const result = handlers['auto-detect-emuhawk']();

    expect(result.success).toBe(true);
    expect(result.path).toBe('C:\\BizHawk\\EmuHawk.exe');
  });

  test('returns failure when EmuHawk not found', () => {
    findEmuHawkPath.mockReturnValue(null);

    const result = handlers['auto-detect-emuhawk']();

    expect(result.success).toBe(false);
  });
});

describe('fetch-challenges', () => {
  test('downloads assets then fetches challenges', async () => {
    downloadAssetsFromRepo.mockResolvedValue({ success: true });
    fetchChallenges.mockResolvedValue({ games: [] });

    await handlers['fetch-challenges']();

    expect(downloadAssetsFromRepo).toHaveBeenCalled();
    expect(fetchChallenges).toHaveBeenCalled();
  });

  test('still fetches challenges when asset download fails', async () => {
    downloadAssetsFromRepo.mockResolvedValue({ success: false, error: 'Network error' });
    fetchChallenges.mockResolvedValue({ games: [] });
    jest.spyOn(console, 'warn').mockImplementation();

    await handlers['fetch-challenges']();

    expect(fetchChallenges).toHaveBeenCalled();
  });
});

describe('telemetry', () => {
  test('get-telemetry returns current state', () => {
    state.telemetryEnabled = true;

    const result = handlers['get-telemetry']();

    expect(result).toBe(true);
  });

  test('set-telemetry updates state', () => {
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const result = handlers['set-telemetry']({}, true);

    expect(result).toBe(true);
    expect(state.telemetryEnabled).toBe(true);
  });
});
