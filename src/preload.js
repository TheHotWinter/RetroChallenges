const { contextBridge, ipcRenderer } = require('electron');

// Whitelist of allowed IPC channels
const INVOKE_CHANNELS = [
  'authenticate',
  'select-emuhawk',
  'download-bizhawk',
  'force-download-bizhawk',
  'fetch-challenges',
  'launch-challenge',
  'get-user-info',
  'get-emuhawk-path',
  'get-user-data-paths',
  'auto-detect-emuhawk',
  'logout',
  'get-config',
  'get-telemetry',
  'set-telemetry',
  'install-mono',
  'open-rom-folder'
];

const ON_CHANNELS = [
  'show-bizhawk-popup',
  'show-bizhawk-warning',
  'challenge-completed',
  'download-progress'
];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`IPC channel "${channel}" is not allowed`);
  },
  on: (channel, callback) => {
    if (ON_CHANNELS.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    throw new Error(`IPC channel "${channel}" is not allowed`);
  }
});
