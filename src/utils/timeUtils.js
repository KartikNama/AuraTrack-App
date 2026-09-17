/**
 * Time and Date Utilities for AuraTrack Desktop
 */

/**
 * Returns the current day cycle object (00:00:00 - 23:59:59.999 IST)
 */
function getCurrentDayCycle(now = new Date()) {
  // Convert current UTC time to IST (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);

  const cycleYear = istTime.getUTCFullYear();
  const cycleMonth = istTime.getUTCMonth();
  const cycleDay = istTime.getUTCDate();

  // Create start of day in IST (00:00:00 IST = previous day 18:30:00 UTC)
  const cycleStart = new Date(Date.UTC(cycleYear, cycleMonth, cycleDay, 0, 0, 0, 0) - istOffset);
  const cycleEnd = new Date(Date.UTC(cycleYear, cycleMonth, cycleDay, 23, 59, 59, 999) - istOffset);
  const cycleDate = new Date(Date.UTC(cycleYear, cycleMonth, cycleDay));

  const dateString = `${cycleYear}-${String(cycleMonth + 1).padStart(2, '0')}-${String(cycleDay).padStart(2, '0')}`;

  return {
    start: cycleStart,
    end: cycleEnd,
    date: cycleDate,
    dateString: dateString
  };
}

/**
 * Format a Date object as IST string
 */
function formatISTTime(date) {
  if (!date) return '';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Format duration in seconds to HH:MM:SS
 */
function formatDuration(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) {
    return '00:00:00';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Compare two semver strings (e.g. "1.6.2" vs "1.6.0")
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(version1, version2) {
  if (!version1 || !version2) return 0;
  
  // Strip any pre-release or build suffixes for base numeric comparison
  const cleanV1 = version1.replace(/^[^\d]*/, '').split('-')[0];
  const cleanV2 = version2.replace(/^[^\d]*/, '').split('-')[0];

  const v1parts = cleanV1.split('.').map(Number);
  const v2parts = cleanV2.split('.').map(Number);

  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;

    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }

  return 0;
}

module.exports = {
  getCurrentDayCycle,
  formatISTTime,
  formatDuration,
  compareVersions
};
