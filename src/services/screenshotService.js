/**
 * Screenshot Capture Service for AuraTrack Desktop
 * Multi-display capture, sharp image optimization, and storage upload
 */

const screenshot = require('screenshot-desktop');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { supabase } = require('../config/supabase');
const { logger } = require('../utils/logger');
const captureSettingsService = require('./captureSettingsService');

class ScreenshotService {
  constructor() {
    this.cachedDisplays = null;
    this.displayCacheTime = 0;
  }

  async checkPermission() {
    try {
      const testBuffer = await screenshot({ format: 'png' });
      return { granted: Boolean(testBuffer && testBuffer.length > 0) };
    } catch (err) {
      return { granted: false, error: err.message };
    }
  }

  async getDisplays() {
    const now = Date.now();
    if (this.cachedDisplays && (now - this.displayCacheTime < 60000)) {
      return this.cachedDisplays;
    }

    let displays = [];
    try {
      if (typeof screenshot.listDisplays === 'function') {
        displays = await screenshot.listDisplays();
      }
    } catch (_) {}

    if (!displays || displays.length === 0) {
      displays = [{ id: 0, name: 'Primary Display' }];
    }

    this.cachedDisplays = displays;
    this.displayCacheTime = now;
    return displays;
  }

  async captureScreenshots(timeEntryId, userId, projectId = null, telemetry = {}) {
    if (!timeEntryId || !userId) return;

    const settings = captureSettingsService.getSettings();
    if (!settings.enableScreenshotCapture) {
      logger.info('Screenshot capture skipped (disabled in Admin Panel for this user)');
      return;
    }

    const tempDir = path.join(os.tmpdir(), 'auratrack-captures');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      const displays = await this.getDisplays();
      logger.info(`Capturing ${displays.length} display(s)...`);

      for (let i = 0; i < displays.length; i++) {
        const display = displays[i];
        let rawBuffer = null;

        try {
          if (display.id !== undefined) {
            rawBuffer = await screenshot({ screen: display.id, format: 'png' });
          } else {
            rawBuffer = await screenshot({ format: 'png' });
          }
        } catch (err) {
          logger.warn(`Failed to capture screen ${i}:`, err.message);
          continue;
        }

        if (!rawBuffer || rawBuffer.length === 0) continue;

        const timestamp = Date.now();
        const fileName = `${userId}_${timestamp}_screen${i}.png`;
        const tempFilePath = path.join(tempDir, fileName);

        // Compress and write with sharp
        await sharp(rawBuffer)
          .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
          .png({ quality: 80, compressionLevel: 6 })
          .toFile(tempFilePath);

        // Upload to Supabase Storage
        const fileBuffer = fs.readFileSync(tempFilePath);
        const storagePath = `${userId}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(storagePath, fileBuffer, {
            contentType: 'image/png',
            upsert: false
          });

        if (uploadError) {
          logger.error('Error uploading screenshot to Supabase Storage:', uploadError);
          try { fs.unlinkSync(tempFilePath); } catch (_) {}
          continue;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('screenshots')
          .getPublicUrl(storagePath);

        // Insert database record
        const { data: screenshotRecord, error: dbError } = await supabase
          .from('screenshots')
          .insert({
            time_entry_id: timeEntryId,
            user_id: userId,
            file_path: publicUrl || storagePath,
            storage_path: storagePath,
            type: 'screenshot',
            captured_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (dbError) {
          logger.error('Error saving screenshot record to database:', dbError);
        } else if (screenshotRecord?.id) {
          // Log screenshot activity telemetry
          await this.logScreenshotActivity(screenshotRecord.id, userId, projectId, timeEntryId, telemetry);
        }

        // Cleanup local temp file
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
    } catch (err) {
      logger.error('Screenshot capture loop error:', err);
    }
  }

  async logScreenshotActivity(screenshotId, userId, projectId, timeEntryId, telemetry) {
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() - 600000); // 10 mins interval

      await supabase.from('screenshot_activity').insert({
        screenshot_id: screenshotId,
        user_id: userId,
        project_id: projectId,
        time_entry_id: timeEntryId,
        interval_start_time: startTime.toISOString(),
        interval_end_time: now.toISOString(),
        interval_duration_seconds: 600,
        mouse_usage_percentage: telemetry.mouseUsage || 0,
        keyboard_usage_percentage: telemetry.keyboardUsage || 0,
        mouse_activity_details: telemetry.mouseDetails || {},
        keyboard_activity_details: telemetry.keyboardDetails || {},
        device_os: `${process.platform} ${process.arch}`,
        app_version: require('../../package.json').version
      });
    } catch (_) {
      // Non-blocking telemetry
    }
  }
}

module.exports = new ScreenshotService();
