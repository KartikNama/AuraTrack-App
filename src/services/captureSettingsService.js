/**
 * Capture Settings Service for AuraTrack Desktop
 * Manages per-user screenshot & webcam capture toggles with Realtime sync
 */

const { supabase } = require('../config/supabase');
const { logger } = require('../utils/logger');

class CaptureSettingsService {
  constructor() {
    this.settings = {
      enableScreenshotCapture: true,
      enableCameraCapture: true
    };
    this.userId = null;
    this.subscription = null;
    this.listeners = [];
  }

  async initialize(userId) {
    this.userId = userId;
    await this.fetchSettings();
    this.setupRealtime();
  }

  async fetchSettings() {
    if (!this.userId) return this.settings;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('enable_screenshot_capture, enable_camera_capture, allow_screenshot_capture, allow_camera_capture')
        .eq('id', this.userId)
        .single();

      if (profile && !error) {
        // Support both naming conventions for compatibility
        this.settings.enableScreenshotCapture = profile.enable_screenshot_capture ?? profile.allow_screenshot_capture ?? true;
        this.settings.enableCameraCapture = profile.enable_camera_capture ?? profile.allow_camera_capture ?? true;
        logger.info('Capture settings loaded:', this.settings);
      }
    } catch (err) {
      logger.warn('Error fetching capture settings (defaulting to enabled):', err.message);
    }
    return this.settings;
  }

  setupRealtime() {
    if (!this.userId || this.subscription) return;

    try {
      this.subscription = supabase
        .channel(`profile-capture-settings-${this.userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${this.userId}`
          },
          (payload) => {
            const updated = payload.new;
            if (updated) {
              const newScreenshot = updated.enable_screenshot_capture ?? updated.allow_screenshot_capture ?? true;
              const newCamera = updated.enable_camera_capture ?? updated.allow_camera_capture ?? true;

              const changed = newScreenshot !== this.settings.enableScreenshotCapture || newCamera !== this.settings.enableCameraCapture;

              this.settings.enableScreenshotCapture = newScreenshot;
              this.settings.enableCameraCapture = newCamera;

              if (changed) {
                logger.info('Live capture settings updated from Admin Panel:', this.settings);
                this.notifyListeners();
              }
            }
          }
        )
        .subscribe();
    } catch (err) {
      logger.warn('Could not setup Realtime subscription for capture settings:', err);
    }
  }

  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try {
        cb(this.settings);
      } catch (_) {}
    });
  }

  getSettings() {
    return this.settings;
  }

  cleanup() {
    if (this.subscription) {
      try {
        supabase.removeChannel(this.subscription);
      } catch (_) {}
      this.subscription = null;
    }
    this.listeners = [];
  }
}

module.exports = new CaptureSettingsService();
