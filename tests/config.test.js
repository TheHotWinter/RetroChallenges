jest.mock('electron');

const fs = require('fs');
const { APP_CONFIG, loadAppConfig, saveAppConfig } = require('../src/config');

beforeEach(() => {
  APP_CONFIG.emuhawkPath = '';
  jest.restoreAllMocks();
});

describe('loadAppConfig', () => {
  test('loads emuhawkPath from config file', () => {
    const configData = { emuhawkPath: 'C:\\BizHawk\\EmuHawk.exe' };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(configData));

    loadAppConfig();

    expect(APP_CONFIG.emuhawkPath).toBe('C:\\BizHawk\\EmuHawk.exe');
  });

  test('does nothing when config file does not exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    loadAppConfig();

    expect(APP_CONFIG.emuhawkPath).toBe('');
  });

  test('handles corrupt config file gracefully', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('not json');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    loadAppConfig();

    expect(consoleSpy).toHaveBeenCalled();
    expect(APP_CONFIG.emuhawkPath).toBe('');
  });

  test('does not set emuhawkPath when config has no emuhawkPath field', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ otherField: 'value' }));

    loadAppConfig();

    expect(APP_CONFIG.emuhawkPath).toBe('');
  });
});

describe('saveAppConfig', () => {
  test('writes current emuhawkPath to config file', () => {
    APP_CONFIG.emuhawkPath = '/path/to/EmuHawk';
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    saveAppConfig();

    expect(writeSpy).toHaveBeenCalledWith(
      APP_CONFIG.configPath,
      JSON.stringify({ emuhawkPath: '/path/to/EmuHawk' }, null, 2)
    );
  });

  test('handles write errors gracefully', () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('Disk full'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    saveAppConfig();

    expect(consoleSpy).toHaveBeenCalled();
  });
});
