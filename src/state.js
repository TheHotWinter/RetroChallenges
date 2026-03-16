// Shared mutable application state
const state = {
  mainWindow: null,
  emuProcess: null,
  isAuthenticated: false,
  userInfo: null,
  challengesData: null,
  authTokens: null,
  telemetryEnabled: false
};

module.exports = state;
