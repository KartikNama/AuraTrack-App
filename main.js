/**
 * AuraTrack Desktop - Main Process Entry Point
 */

const { app, ipcMain, shell } = require('electron');
const path = require('path');
const { logger } = require('./src/utils/logger');
const { createMainWindow, registerIPCHandlers, getMainWindow } = require('./src/main/windowManager');
const { setupPowerMonitor } = require('./src/main/powerMonitor');
const { startOAuthServer, stopOAuthServer, OAUTH_PORT } = require('./src/main/oauthServer');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.warn('Another instance is already running. Quitting.');
  app.quit();
} else {
  let mainWindow = null;

  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Register custom URL protocol (tracker://)
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('tracker', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('tracker');
  }

  // Handle Azure SSO browser initiation
  ipcMain.handle('open-azure-sso-window', async (event, { redirectUrl }) => {
    try {
      const callbackUrl = `http://localhost:${OAUTH_PORT}/callback`;
      logger.info('Opening Azure SSO in system browser with callback:', callbackUrl);

      startOAuthServer(({ accessToken, refreshToken }) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('azure-sso-tokens', { accessToken, refreshToken });
        }
      });

      const ssoUrl = new URL(redirectUrl || 'https://timeflow.mechlintech.com');
      ssoUrl.searchParams.set('callback', callbackUrl);

      await shell.openExternal(ssoUrl.toString());
      return { success: true, callbackUrl };
    } catch (err) {
      logger.error('Error opening Azure SSO in external browser:', err);
      return { error: err.message };
    }
  });

  app.whenReady().then(() => {
    logger.info('AuraTrack Desktop starting up...');
    registerIPCHandlers();
    mainWindow = createMainWindow();
    setupPowerMonitor(mainWindow);

    app.on('activate', () => {
      if (getMainWindow() === null) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    stopOAuthServer();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    stopOAuthServer();
  });
}