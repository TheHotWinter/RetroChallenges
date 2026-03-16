jest.mock('electron');
jest.mock('../src/http', () => ({
  httpClient: { post: jest.fn(), get: jest.fn() }
}));
jest.mock('../src/webhook', () => ({
  sendWebhookNotification: jest.fn()
}));

const fs = require('fs');
const { httpClient } = require('../src/http');
const { APP_CONFIG } = require('../src/config');
const state = require('../src/state');
const { loadAuthData, clearAuthData, saveAuthData } = require('../src/auth');

beforeEach(() => {
  state.isAuthenticated = false;
  state.userInfo = null;
  state.authTokens = null;
  httpClient.post.mockReset();
  httpClient.get.mockReset();
  jest.restoreAllMocks();
});

describe('loadAuthData', () => {
  test('returns null when auth file does not exist', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = await loadAuthData();

    expect(result).toBeNull();
  });

  test('returns auth data when tokens are still valid', async () => {
    const authData = {
      user: { name: 'Test', email: 'test@test.com', id: '1' },
      tokens: { access_token: 'tok', expires_at: Date.now() + 60000 }
    };
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(authData));

    const result = await loadAuthData();

    expect(result).toEqual(authData);
  });

  test('clears auth data when user info is invalid', async () => {
    const authData = { user: { name: '' }, tokens: null };
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(authData));
    jest.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);

    const result = await loadAuthData();

    expect(result).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  test('clears auth data on corrupt file', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('not json');
    jest.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);
    jest.spyOn(console, 'error').mockImplementation();

    const result = await loadAuthData();

    expect(result).toBeNull();
  });

  test('attempts token refresh when tokens are expired', async () => {
    const authData = {
      user: { name: 'Test', email: 'test@test.com', id: '1' },
      tokens: { access_token: 'old', refresh_token: 'refresh', expires_at: Date.now() - 1000 }
    };
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(authData));
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    httpClient.post.mockResolvedValue({
      data: { access_token: 'new_tok', expires_in: 3600 }
    });
    httpClient.get.mockResolvedValue({
      data: { name: 'Test', email: 'test@test.com', id: '1', picture: null }
    });

    const result = await loadAuthData();

    expect(result).not.toBeNull();
    expect(result.user.name).toBe('Test');
    expect(httpClient.post).toHaveBeenCalled();
  });

  test('returns null when refresh fails and no refresh token', async () => {
    const authData = {
      user: { name: 'Test', email: 'test@test.com', id: '1' },
      tokens: { access_token: 'old', expires_at: Date.now() - 1000 }
    };
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(authData));

    const result = await loadAuthData();

    expect(result).toBeNull();
  });
});

describe('clearAuthData', () => {
  test('removes auth file and resets state', () => {
    state.isAuthenticated = true;
    state.userInfo = { name: 'Test' };
    state.authTokens = { access_token: 'tok' };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);

    clearAuthData();

    expect(unlinkSpy).toHaveBeenCalledWith(APP_CONFIG.authDataPath);
    expect(state.isAuthenticated).toBe(false);
    expect(state.userInfo).toBeNull();
    expect(state.authTokens).toBeNull();
  });

  test('handles missing file gracefully', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    clearAuthData();

    expect(state.isAuthenticated).toBe(false);
  });
});

describe('saveAuthData', () => {
  test('writes auth data to file', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    const user = { name: 'Test', email: 'test@test.com' };

    saveAuthData(user, null);

    expect(writeSpy).toHaveBeenCalledWith(
      APP_CONFIG.authDataPath,
      expect.stringContaining('"name": "Test"')
    );
  });

  test('handles write errors gracefully', () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('Fail'); });
    jest.spyOn(console, 'error').mockImplementation();

    expect(() => saveAuthData({}, null)).not.toThrow();
  });
});
