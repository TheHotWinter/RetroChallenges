jest.mock('electron');

const fs = require('fs');
const { APP_CONFIG, loadAppConfig, saveAppConfig } = require('../src/config');
const state = require('../src/state');

beforeEach(() => {
  APP_CONFIG.emuhawkPath = '';
  state.telemetryEnabled = false;
  jest.restoreAllMocks();
});

describe('loadAppConfig', () => {
  test('loads emuhawkPath from config file', () => {
    const configData = { emuhawkPath: 'C:\\BizHawk\\EmuHawk.exe' };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(configData));

    loadAppConfig(state);

    expect(APP_CONFIG.emuhawkPath).toBe('C:\\BizHawk\\EmuHawk.exe');
  });

  test('loads telemetryEnabled from config file', () => {
    const configData = { emuhawkPath: '', telemetryEnabled: true };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(configData));

    loadAppConfig(state);

    expect(state.telemetryEnabled).toBe(true);
  });

  test('does nothing when config file does not exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    loadAppConfig(state);

    expect(APP_CONFIG.emuhawkPath).toBe('');
  });

  test('handles corrupt config file gracefully', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('not json');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    loadAppConfig(state);

    expect(consoleSpy).toHaveBeenCalled();
    expect(APP_CONFIG.emuhawkPath).toBe('');
  });

  test('does not set emuhawkPath when config has no emuhawkPath field', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ otherField: 'value' }));

    loadAppConfig(state);

    expect(APP_CONFIG.emuhawkPath).toBe('');
  });
});

describe('saveAppConfig', () => {
  test('writes current emuhawkPath and telemetry to config file', () => {
    APP_CONFIG.emuhawkPath = '/path/to/EmuHawk';
    state.telemetryEnabled = true;
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    saveAppConfig(state);

    expect(writeSpy).toHaveBeenCalledWith(
      APP_CONFIG.configPath,
      JSON.stringify({ emuhawkPath: '/path/to/EmuHawk', telemetryEnabled: true }, null, 2)
    );
  });

  test('handles write errors gracefully', () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('Disk full'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    saveAppConfig(state);

    expect(consoleSpy).toHaveBeenCalled();
  });
});
