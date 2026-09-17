/**
 * System Activity and Idle Utilities for AuraTrack Desktop
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');

let lastQueriedIdleSeconds = 0;
let lastQueryTimestamp = 0;
const QUERY_THROTTLE_MS = 3000; // Query at most every 3 seconds to save CPU

/**
 * Get OS-level idle time in seconds
 */
function getSystemIdleTime() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (now - lastQueryTimestamp < QUERY_THROTTLE_MS) {
      return resolve(lastQueriedIdleSeconds);
    }

    if (process.platform === 'win32') {
      const psCmd = `powershell.exe -NoProfile -NonInteractive -Command "Add-Type @'
using System;
using System.Runtime.InteropServices;
public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
public class LastInput {
  [DllImport(\\"User32.dll\\")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport(\\"Kernel32.dll\\")] public static extern uint GetTickCount();
}
'@; $lii = New-Object LASTINPUTINFO; $lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lii); [LastInput]::GetLastInputInfo([ref]$lii); ($([LastInput]::GetTickCount()) - $lii.dwTime) / 1000"`;

      exec(psCmd, { timeout: 3000 }, (error, stdout) => {
        if (!error && stdout) {
          const parsed = parseFloat(stdout.trim());
          if (!isNaN(parsed) && parsed >= 0) {
            lastQueriedIdleSeconds = parsed;
            lastQueryTimestamp = now;
            return resolve(parsed);
          }
        }
        resolve(0);
      });
    } else {
      // macOS / Linux fallback
      resolve(0);
    }
  });
}

module.exports = {
  getSystemIdleTime
};
