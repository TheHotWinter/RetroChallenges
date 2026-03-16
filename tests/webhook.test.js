jest.mock('electron');
jest.mock('axios');

const axios = require('axios');
const fs = require('fs');
const state = require('../src/state');

// Need to set DISCORD_WEBHOOK_URL before requiring webhook module
// We mock config to always have a URL
jest.mock('../src/config', () => ({
  APP_CONFIG: {
    emuhawkPath: '',
    challengesPath: '/tmp/test-retrochallenges/userData/challenges',
    romsPath: '/tmp/test-retrochallenges/userData/roms',
    bizhawkPath: '/tmp/test-retrochallenges/userData/bizhawk'
  },
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test/test'
}));

const { sendWebhookNotification } = require('../src/webhook');

beforeEach(() => {
  state.userInfo = null;
  state.isAuthenticated = false;
  state.challengesData = null;
  state.telemetryEnabled = true; // Enable for most tests
  axios.post.mockReset();
  jest.restoreAllMocks();
});

describe('sendWebhookNotification', () => {
  test('sends basic notification without user info', async () => {
    axios.post.mockResolvedValue({});

    await sendWebhookNotification('Test message', 'Test Title');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload.embeds[0].title).toBe('Test Title');
    expect(payload.embeds[0].description).toBe('Test message');
    expect(payload.embeds[0].color).toBe(0x00ff00);
  });

  test('skips sending when telemetry is disabled', async () => {
    state.telemetryEnabled = false;
    axios.post.mockResolvedValue({});

    await sendWebhookNotification('Should not send', 'Title');

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('includes user info when flag is true and user is available', async () => {
    state.userInfo = { name: 'Test User', email: 'test@test.com', id: '123' };
    state.isAuthenticated = true;
    axios.post.mockResolvedValue({});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    await sendWebhookNotification('Hello', 'Title', true);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload.embeds[0].description).toContain('Test User');
    expect(payload.embeds[0].description).toContain('test@test.com');
    expect(payload.embeds[0].description).toContain('Authenticated');
    expect(payload.embeds[0].color).toBe(0x0099ff);
  });

  test('does not include user info when flag is true but no user', async () => {
    state.userInfo = null;
    axios.post.mockResolvedValue({});

    await sendWebhookNotification('No user here', 'Title', true);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload.embeds[0].description).toBe('No user here');
    expect(payload.embeds[0].color).toBe(0x00ff00);
  });

  test('includes challenge counts when challenges are loaded', async () => {
    state.userInfo = { name: 'User', email: 'u@t.com', id: '1' };
    state.challengesData = {
      games: [
        { name: 'Game1', challenges: [{ name: 'c1' }, { name: 'c2' }] },
        { name: 'Game2', challenges: [{ name: 'c3' }] }
      ]
    };
    axios.post.mockResolvedValue({});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    await sendWebhookNotification('With challenges', 'Title', true);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload.embeds[0].description).toContain('Available Games:** 2');
    expect(payload.embeds[0].description).toContain('Total Challenges:** 3');
  });

  test('does not throw when webhook request fails', async () => {
    axios.post.mockRejectedValue(new Error('Network error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(sendWebhookNotification('Test')).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith('Error sending webhook notification:', 'Network error');
  });

  test('uses default title when none provided', async () => {
    axios.post.mockResolvedValue({});

    await sendWebhookNotification('Default title test');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload.embeds[0].title).toBe('RetroChallenges App');
  });
});
