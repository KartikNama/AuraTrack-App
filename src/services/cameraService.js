/**
 * Camera and Webcam Capture Service for AuraTrack Desktop
 * Device detection, fallback constraints, face verification, and cloud upload
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { supabase } = require('../config/supabase');
const { logger } = require('../utils/logger');
const captureSettingsService = require('./captureSettingsService');

class CameraService {
  constructor() {
    this.isFaceApiLoaded = false;
  }

  async checkPermission() {
    try {
      const stream = await this.getCameraStream(5000);
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(t => t.stop());
      }
      return { granted: true };
    } catch (err) {
      return { granted: false, error: err.message };
    }
  }

  async detectHardware() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      return { detected: videoDevices.length > 0, count: videoDevices.length };
    } catch (err) {
      return { detected: false, error: err.message };
    }
  }

  /**
   * Robust camera stream getter with fallback constraints
   */
  async getCameraStream(timeoutMs = 10000) {
    const constraintConfigs = [
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: true }
    ];

    let lastError = null;

    for (const constraints of constraintConfigs) {
      try {
        const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Camera acquisition timed out')), timeoutMs)
        );

        const stream = await Promise.race([streamPromise, timeoutPromise]);
        if (stream) return stream;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Unable to access camera hardware');
  }

  async captureCameraShot(timeEntryId, userId, projectId = null) {
    if (!timeEntryId || !userId) return;

    const settings = captureSettingsService.getSettings();
    if (!settings.enableCameraCapture) {
      logger.info('Camera capture skipped (disabled in Admin Panel for this user)');
      return;
    }

    let stream = null;
    let video = null;

    try {
      logger.info('Acquiring camera stream for snapshot...');
      stream = await this.getCameraStream(10000);

      video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      document.body.appendChild(video);

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video frame timeout')), 5000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          video.play().then(() => setTimeout(resolve, 350)).catch(reject);
        };
        video.onerror = (e) => {
          clearTimeout(timer);
          reject(e);
        };
      });

      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, width, height);

      // Convert canvas to blob
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (!blob) throw new Error('Canvas conversion returned empty blob');

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const timestamp = Date.now();
      const fileName = `${userId}_${timestamp}_camera.jpg`;
      const storagePath = `${userId}/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        logger.error('Error uploading camera shot:', uploadError);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('screenshots')
        .getPublicUrl(storagePath);

      // Save database entry
      await supabase.from('screenshots').insert({
        time_entry_id: timeEntryId,
        user_id: userId,
        file_path: publicUrl || storagePath,
        storage_path: storagePath,
        type: 'camera',
        captured_at: new Date().toISOString()
      });

      logger.info('Camera snapshot successfully captured and stored');
    } catch (err) {
      logger.warn('Camera snapshot process encountered an issue:', err.message);
    } finally {
      // Clean up WebRTC tracks and DOM elements
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(t => {
          try { t.stop(); } catch (_) {}
        });
      }
      if (video) {
        try {
          video.pause();
          video.srcObject = null;
          if (video.parentNode) video.parentNode.removeChild(video);
        } catch (_) {}
      }
    }
  }
}

module.exports = new CameraService();
