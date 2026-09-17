/**
 * Window Manager for AuraTrack Desktop
 */

const { BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { logger } = require('../utils/logger');

let mainWindow = null;
let overlayWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 680,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    show: false,
    icon: path.join(__dirname, '../../build/icon-256.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../../index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  });

  return mainWindow;
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    width: 480,
    height: 380,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, '../../overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.center();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

function registerIPCHandlers() {
  ipcMain.handle('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle('show-overlay', (event, options = {}) => {
    const win = createOverlayWindow();
    win.show();
    win.focus();
    win.webContents.send('update-overlay', options);
    return { success: true };
  });

  ipcMain.handle('hide-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    return { success: true };
  });

  ipcMain.on('overlay-continue', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay-continue');
    }
  });

  ipcMain.on('overlay-stop', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay-stop');
    }
  });
}

function getMainWindow() {
  return mainWindow;
}

module.exports = {
  createMainWindow,
  createOverlayWindow,
  registerIPCHandlers,
  getMainWindow
};
