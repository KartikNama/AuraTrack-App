/**
 * Storage Service for AuraTrack Desktop
 * Handles resilient offline caching, day cycle persistence & safe duration merging
 */

const { logger } = require('../utils/logger');

class StorageService {
  getStorageKey(userId, dateString) {
    return `time_tracker_${userId}_${dateString}`;
  }

  saveLocal(userId, dateString, data) {
    if (!userId || !dateString) return;
    try {
      const key = this.getStorageKey(userId, dateString);
      const existing = this.loadLocal(userId, dateString) || {};
      
      const payload = {
        ...existing,
        ...data,
        userId,
        dateString,
        lastUpdated: Date.now()
      };
      
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (err) {
      logger.error('Failed to write to localStorage:', err);
    }
  }

  loadLocal(userId, dateString) {
    if (!userId || !dateString) return null;
    try {
      const key = this.getStorageKey(userId, dateString);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      logger.error('Failed to read from localStorage:', err);
      return null;
    }
  }

  clearLocal(userId, dateString) {
    if (!userId || !dateString) return;
    try {
      const key = this.getStorageKey(userId, dateString);
      localStorage.removeItem(key);
    } catch (_) {}
  }

  /**
   * Cleans up all storage keys belonging to previous days for this user
   */
  cleanupOldDays(userId, currentDateString) {
    if (!userId) return;
    try {
      const prefix = `time_tracker_${userId}_`;
      const currentKey = this.getStorageKey(userId, currentDateString);
      const keysToDelete = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix) && key !== currentKey) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(k => localStorage.removeItem(k));
      if (keysToDelete.length > 0) {
        logger.info(`Purged ${keysToDelete.length} stale localStorage entries from previous days`);
      }
    } catch (err) {
      logger.warn('Error cleaning up old storage days:', err);
    }
  }

  /**
   * Utility to safely compute monotonic duration without decrementing
   */
  ensureMaxDuration(localDuration = 0, remoteDuration = 0) {
    const l = Math.max(0, parseInt(localDuration, 10) || 0);
    const r = Math.max(0, parseInt(remoteDuration, 10) || 0);
    return Math.max(l, r);
  }
}

module.exports = new StorageService();
