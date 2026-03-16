module.exports = {
  app: {
    getPath: (name) => `/tmp/test-retrochallenges/${name}`,
    getVersion: () => '1.0.0',
    whenReady: () => Promise.resolve(),
    on: jest.fn(),
    quit: jest.fn()
  },
  BrowserWindow: class {
    constructor() {
      this.webContents = {
        send: jest.fn(),
        on: jest.fn(),
        executeJavaScript: jest.fn(),
        openDevTools: jest.fn(),
        setWindowOpenHandler: jest.fn()
      };
    }
    loadFile() { return Promise.resolve(); }
    loadURL() { return Promise.resolve(); }
    show() {}
    focus() {}
    close() {}
    once() {}
    on() {}
    static getAllWindows() { return []; }
  },
  ipcMain: { handle: jest.fn() },
  dialog: { showOpenDialog: jest.fn() },
  shell: { openExternal: jest.fn(), openPath: jest.fn() }
};
