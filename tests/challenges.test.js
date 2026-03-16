jest.mock('electron');
jest.mock('adm-zip');
jest.mock('../src/http', () => ({
  httpClient: { get: jest.fn() }
}));

const fs = require('fs');
const path = require('path');
const { httpClient } = require('../src/http');
const { APP_CONFIG } = require('../src/config');
const state = require('../src/state');
const { fetchChallenges, downloadAssetsFromRepo, ensureRomsDirectory } = require('../src/challenges');

beforeEach(() => {
  state.challengesData = null;
  state.mainWindow = null;
  httpClient.get.mockReset();
  jest.restoreAllMocks();
});

describe('fetchChallenges', () => {
  test('loads from downloaded assets challenges.json when it exists', async () => {
    const mockData = { games: [{ name: 'TestGame', challenges: [{ name: 'c1', lua: 'test.lua' }] }] };
    const downloadedPath = path.join(APP_CONFIG.challengesPath, 'challenges.json');

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockData));

    const result = await fetchChallenges();

    expect(fs.existsSync).toHaveBeenCalledWith(downloadedPath);
    expect(result).toEqual(mockData);
    expect(state.challengesData).toEqual(mockData);
  });

  test('falls back to remote URL when downloaded assets do not exist', async () => {
    const mockData = { games: [{ name: 'RemoteGame', challenges: [{ name: 'c1', lua: 'test.lua' }] }] };

    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    httpClient.get.mockResolvedValue({ data: mockData });

    const result = await fetchChallenges();

    expect(httpClient.get).toHaveBeenCalledWith(APP_CONFIG.challengesUrl, expect.objectContaining({
      timeout: 10000
    }));
    expect(result).toEqual(mockData);
    expect(state.challengesData).toEqual(mockData);
  });

  test('returns empty games array when both downloaded and remote fail', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    httpClient.get.mockRejectedValue(new Error('Network error'));

    const result = await fetchChallenges();

    expect(result).toEqual({ games: [] });
    expect(state.challengesData).toEqual({ games: [] });
  });

  test('sets state.challengesData on successful fetch', async () => {
    const mockData = { games: [{ name: 'StateTest', challenges: [{ name: 'c1', lua: 'x.lua' }] }] };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockData));

    await fetchChallenges();

    expect(state.challengesData).toEqual(mockData);
  });

  test('rejects invalid data structure from downloaded file', async () => {
    const invalidData = { games: 'not an array' };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(invalidData));

    const result = await fetchChallenges();

    expect(result).toEqual({ games: [] });
  });

  test('rejects challenges missing required fields', async () => {
    const invalidData = { games: [{ name: 'Game', challenges: [{ name: 'c1' }] }] };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(invalidData));

    const result = await fetchChallenges();

    expect(result).toEqual({ games: [] });
  });

  test('rejects invalid remote data', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    httpClient.get.mockResolvedValue({ data: { notGames: true } });

    const result = await fetchChallenges();

    expect(result).toEqual({ games: [] });
  });
});

describe('downloadAssetsFromRepo', () => {
  test('returns success false when download fails', async () => {
    httpClient.get.mockRejectedValue(new Error('Download failed'));

    const result = await downloadAssetsFromRepo();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Download failed');
  });

  test('returns success false when extracted folder not found', async () => {
    httpClient.get.mockResolvedValue({ data: Buffer.from('fake-zip') });

    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'readdirSync').mockReturnValue(['some-other-folder']);
    jest.spyOn(fs, 'rmSync').mockReturnValue(undefined);

    const AdmZip = require('adm-zip');
    AdmZip.mockImplementation(() => ({
      extractAllTo: jest.fn()
    }));

    const result = await downloadAssetsFromRepo();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Could not find extracted assets folder');
  });

  test('extracts and copies files on success', async () => {
    httpClient.get.mockResolvedValue({ data: Buffer.from('fake-zip') });

    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'rmSync').mockReturnValue(undefined);
    const copyFileSpy = jest.spyOn(fs, 'copyFileSync').mockReturnValue(undefined);
    const cpSpy = jest.spyOn(fs, 'cpSync').mockReturnValue(undefined);

    let readdirCallCount = 0;
    jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
      readdirCallCount++;
      if (readdirCallCount === 1) return ['retrochallenges-assets-main'];
      return ['file1.lua', 'subdir'];
    });
    jest.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
      isDirectory: () => filePath.endsWith('subdir')
    }));

    const AdmZip = require('adm-zip');
    AdmZip.mockImplementation(() => ({
      extractAllTo: jest.fn()
    }));

    const result = await downloadAssetsFromRepo();

    expect(result.success).toBe(true);
    expect(copyFileSpy).toHaveBeenCalled();
    expect(cpSpy).toHaveBeenCalled();
  });
});

describe('ensureRomsDirectory', () => {
  test('creates roms directory if it does not exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);

    ensureRomsDirectory();

    expect(mkdirSpy).toHaveBeenCalledWith(APP_CONFIG.romsPath, { recursive: true });
  });

  test('does not create directory if it already exists', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);

    ensureRomsDirectory();

    expect(mkdirSpy).not.toHaveBeenCalled();
  });

  test('handles errors gracefully', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('Permission denied'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    ensureRomsDirectory();

    expect(consoleSpy).toHaveBeenCalled();
  });
});
