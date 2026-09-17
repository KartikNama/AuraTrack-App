/**
 * Power Monitor and OS Session Event Handler for AuraTrack Desktop
 */

const { powerMonitor } = require('electron');
const { logger } = require('../utils/logger');
const { exec } = require('child_process');

let lastSessionId = null;

function setupPowerMonitor(mainWindow) {
  powerMonitor.on('lock-screen', () => {
    logger.info('Lock screen detected');
    sendSystemEvent(mainWindow, 'screen-locked', 'Screen locked by user');
  });

  powerMonitor.on('suspend', () => {
    logger.info('System suspend detected');
    sendSystemEvent(mainWindow, 'system-sleep', 'System entered sleep mode');
  });

  powerMonitor.on('shutdown', () => {
    logger.info('System shutdown detected');
    sendSystemEvent(mainWindow, 'system-shutdown', 'System is shutting down');
  });

  // Windows user switch detection
  if (process.platform === 'win32') {
    setupWindowsSessionMonitor(mainWindow);
  }
}

function sendSystemEvent(mainWindow, type, reason) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system-event', { type, reason });
  }
}

function setupWindowsSessionMonitor(mainWindow) {
  setInterval(() => {
    exec('powershell -NoProfile -Command "(Get-Process -Id $PID).SessionId"', (err, stdout) => {
      if (!err && stdout) {
        const currentSession = stdout.trim();
        if (lastSessionId && lastSessionId !== currentSession) {
          logger.info(`Session switched: ${lastSessionId} -> ${currentSession}`);
          sendSystemEvent(mainWindow, 'user-switched', 'User session switched');
        }
        lastSessionId = currentSession;
      }
    });
  }, 30000);
}

module.exports = {
  setupPowerMonitor
};
