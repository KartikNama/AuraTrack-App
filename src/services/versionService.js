/**
 * Version Management Service for AuraTrack Desktop
 */

const { supabase } = require('../config/supabase');
const { logger } = require('../utils/logger');
const { compareVersions } = require('../utils/timeUtils');

class VersionService {
  /**
   * Validates the client version against system_settings
   */
  async checkTrackerVersion(currentVersion, userId = null, deviceInfo = null) {
    try {
      logger.info(`Checking version compatibility for v${currentVersion}...`);

      const { data: settings, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['tracker_required_version', 'tracker_update_url', 'tracker_force_update']);

      if (error) {
        logger.warn('Failed to query version settings (failing open):', error.message);
        return {
          isCompatible: true,
          requiredVersion: currentVersion,
          forceUpdate: false,
          updateUrl: null
        };
      }

      const settingsMap = {};
      (settings || []).forEach(item => {
        let val = item.value;
        if (typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch (_) {}
        }
        settingsMap[item.key] = val;
      });

      const requiredVersionRaw = settingsMap['tracker_required_version'] || currentVersion;
      const updateUrl = settingsMap['tracker_update_url'] || null;
      const forceUpdate = Boolean(settingsMap['tracker_force_update']);

      // Parse allowed versions (comma-separated or single)
      const allowedVersions = typeof requiredVersionRaw === 'string'
        ? requiredVersionRaw.split(',').map(v => v.trim())
        : [String(requiredVersionRaw)];

      // Check if exact match exists or if version is greater than minimum allowed
      const isExactMatch = allowedVersions.includes(currentVersion);
      const isGreaterOrEqual = allowedVersions.some(v => compareVersions(currentVersion, v) >= 0);
      const isCompatible = isExactMatch || isGreaterOrEqual;

      // Log version check telemetry to user_logs if user is logged in
      if (userId) {
        this.logVersionCheck(userId, currentVersion, isCompatible, deviceInfo);
      }

      logger.info(`Version check result: Compatible=${isCompatible}, Required=${requiredVersionRaw}`);

      return {
        isCompatible,
        requiredVersion: allowedVersions[0],
        forceUpdate,
        updateUrl,
        currentVersion
      };
    } catch (err) {
      logger.error('Error during version verification:', err);
      // Fail open so network issues do not brick desktop app
      return {
        isCompatible: true,
        requiredVersion: currentVersion,
        forceUpdate: false,
        updateUrl: null
      };
    }
  }

  async logVersionCheck(userId, appVersion, isCompatible, deviceInfo) {
    try {
      await supabase.from('user_logs').insert({
        user_id: userId,
        action: 'tracker_version_check',
        metadata: {
          app_version: appVersion,
          is_compatible: isCompatible,
          device_info: deviceInfo || `${process.platform} ${process.arch}`
        }
      });
    } catch (_) {
      // Non-blocking telemetry
    }
  }

  async trackVersionUsage(userId, appVersion) {
    if (!userId || !appVersion) return;
    try {
      await supabase.from('user_logs').insert({
        user_id: userId,
        action: 'tracker_startup',
        metadata: {
          app_version: appVersion,
          platform: process.platform,
          arch: process.arch
        }
      });
    } catch (_) {
      // Non-blocking
    }
  }
}

module.exports = new VersionService();
