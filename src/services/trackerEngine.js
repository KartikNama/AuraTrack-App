/**
 * Core Time Tracking Engine for AuraTrack Desktop
 * Manages tracking state, day cycles, monotonic timers, captures, and database synchronization
 */

const { supabase } = require('../config/supabase');
const { logger } = require('../utils/logger');
const { getCurrentDayCycle, formatDuration } = require('../utils/timeUtils');
const storageService = require('./storageService');
const screenshotService = require('./screenshotService');
const cameraService = require('./cameraService');
const captureSettingsService = require('./captureSettingsService');
const { ipcRenderer } = require('electron');

const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes inactivity
const CAPTURE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes periodic capture
const SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds periodic DB sync

class TrackerEngine {
  constructor() {
    this.currentUser = null;
    this.selectedProjectId = null;
    this.selectedTaskId = null;

    this.isTracking = false;
    this.isPaused = false;
    this.timeEntryId = null;

    this.currentDayCycle = null;
    this.baseDuration = 0; // Cumulative duration from earlier sessions today
    this.sessionStartPerfMs = null; // Monotonic clock start timestamp
    this.pausedDuration = 0; // Total paused ms
    this.pauseStartPerfMs = null;

    this.lastActivityTime = Date.now();
    this.listeners = [];

    // Interval timers
    this.timerInterval = null;
    this.syncInterval = null;
    this.captureInterval = null;
    this.idleCheckInterval = null;
    this.dayCheckInterval = null;

    this.setupIPCListeners();
  }

  setupIPCListeners() {
    ipcRenderer.on('overlay-continue', () => {
      this.resumeTracking(false);
    });

    ipcRenderer.on('overlay-stop', () => {
      this.stopTracking(true); // Deduct idle time on stop
    });

    ipcRenderer.on('system-event', async (event, data) => {
      logger.info('System event detected:', data.type, data.reason);
      if (this.isTracking) {
        await this.stopTracking(false);
        this.notify('system-stop', data);
      }
    });
  }

  async initializeUser(user) {
    this.currentUser = user;
    this.currentDayCycle = getCurrentDayCycle();

    // Clean up stale previous days from storage
    storageService.cleanupOldDays(user.id, this.currentDayCycle.dateString);

    // Initialize per-user capture settings
    await captureSettingsService.initialize(user.id);

    // Load existing duration for current day cycle
    await this.loadTodaySession();

    // Start daily midnight reset monitor
    this.startDayCycleMonitor();
  }

  async loadTodaySession() {
    if (!this.currentUser) return;
    this.currentDayCycle = getCurrentDayCycle();

    // 1. Read local storage cache
    const local = storageService.loadLocal(this.currentUser.id, this.currentDayCycle.dateString);
    let localDuration = local?.duration || 0;
    let localTimeEntryId = local?.timeEntryId || null;

    // 2. Read remote database entries for this day cycle
    let remoteDuration = 0;
    let remoteTimeEntryId = null;

    try {
      const { data: entries, error } = await supabase
        .from('time_entries')
        .select('id, duration, status, start_time')
        .eq('user_id', this.currentUser.id)
        .gte('start_time', this.currentDayCycle.start.toISOString())
        .lte('start_time', this.currentDayCycle.end.toISOString())
        .order('start_time', { ascending: false });

      if (!error && entries && entries.length > 0) {
        // Find existing running entry or sum durations
        const latest = entries[0];
        remoteTimeEntryId = latest.id;
        remoteDuration = latest.duration || 0;
      }
    } catch (err) {
      logger.warn('Could not query remote time_entries:', err.message);
    }

    // Merge safely (never decrement recorded time)
    this.baseDuration = storageService.ensureMaxDuration(localDuration, remoteDuration);
    this.timeEntryId = remoteTimeEntryId || localTimeEntryId;

    logger.info(`Loaded today's session (${this.currentDayCycle.dateString}): ${this.baseDuration} seconds`);
    this.notify('duration-update', { duration: this.baseDuration });
  }

  async startTracking(projectId = null, taskId = null) {
    if (this.isTracking || !this.currentUser) return;

    this.selectedProjectId = projectId || this.selectedProjectId;
    this.selectedTaskId = taskId || this.selectedTaskId;
    this.currentDayCycle = getCurrentDayCycle();

    logger.info('Starting tracker session for day:', this.currentDayCycle.dateString);

    const startTime = new Date().toISOString();
    const appVersion = require('../../package.json').version;

    try {
      if (!this.timeEntryId) {
        // Create new time entry in Supabase
        const { data: entry, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: this.currentUser.id,
            project_id: this.selectedProjectId,
            start_time: startTime,
            status: 'running',
            duration: this.baseDuration,
            entry_type: 'automatic',
            app_version: appVersion
          })
          .select('id')
          .single();

        if (!error && entry) {
          this.timeEntryId = entry.id;
        }
      } else {
        // Update existing entry status to running
        await supabase
          .from('time_entries')
          .update({
            status: 'running',
            updated_at: new Date().toISOString()
          })
          .eq('id', this.timeEntryId);
      }
    } catch (err) {
      logger.error('Error starting time entry in Supabase:', err);
    }

    this.isTracking = true;
    this.isPaused = false;
    this.sessionStartPerfMs = performance.now();
    this.pausedDuration = 0;
    this.pauseStartPerfMs = null;
    this.lastActivityTime = Date.now();

    // Start background intervals
    this.startTimerLoop();
    this.startSyncLoop();
    this.startCaptureLoop();
    this.startIdleDetectionLoop();

    // Trigger initial screenshot capture after brief delay
    setTimeout(() => {
      if (this.isTracking) {
        this.runCaptures();
      }
    }, 15000);

    this.notify('tracking-start', { duration: this.baseDuration });
  }

  getMonotonicSessionSeconds() {
    if (!this.sessionStartPerfMs) return 0;
    const now = performance.now();
    let elapsedMs = now - this.sessionStartPerfMs - this.pausedDuration;
    if (this.pauseStartPerfMs) {
      elapsedMs -= (now - this.pauseStartPerfMs);
    }
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }

  getCurrentTotalDuration() {
    return this.baseDuration + this.getMonotonicSessionSeconds();
  }

  startTimerLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isPaused && this.isTracking) {
        const total = this.getCurrentTotalDuration();
        this.notify('tick', { duration: total, formatted: formatDuration(total) });
      }
    }, 1000);
  }

  startSyncLoop() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (this.isTracking && !this.isPaused) {
        this.syncToDatabase();
      }
    }, SYNC_INTERVAL_MS);
  }

  async syncToDatabase() {
    const totalDuration = this.getCurrentTotalDuration();

    // Save to local storage cache first
    storageService.saveLocal(this.currentUser.id, this.currentDayCycle.dateString, {
      duration: totalDuration,
      timeEntryId: this.timeEntryId,
      projectId: this.selectedProjectId,
      taskId: this.selectedTaskId
    });

    if (!this.timeEntryId) return;

    try {
      await supabase
        .from('time_entries')
        .update({
          duration: totalDuration,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.timeEntryId);
    } catch (err) {
      logger.warn('Background duration sync failed (will retry):', err.message);
    }
  }

  startCaptureLoop() {
    if (this.captureInterval) clearInterval(this.captureInterval);
    this.captureInterval = setInterval(() => {
      if (this.isTracking && !this.isPaused) {
        this.runCaptures();
      }
    }, CAPTURE_INTERVAL_MS);
  }

  async runCaptures() {
    if (!this.timeEntryId || !this.currentUser) return;
    logger.info('Executing scheduled captures...');

    await screenshotService.captureScreenshots(this.timeEntryId, this.currentUser.id, this.selectedProjectId);
    await cameraService.captureCameraShot(this.timeEntryId, this.currentUser.id, this.selectedProjectId);
  }

  startIdleDetectionLoop() {
    if (this.idleCheckInterval) clearInterval(this.idleCheckInterval);
    this.idleCheckInterval = setInterval(async () => {
      if (!this.isTracking || this.isPaused) return;

      const idleDuration = Date.now() - this.lastActivityTime;
      if (idleDuration >= IDLE_THRESHOLD_MS) {
        logger.info(`Inactivity detected (${Math.floor(idleDuration / 1000)}s) - Pausing tracker & showing overlay`);
        this.pauseTracking();
        ipcRenderer.invoke('show-overlay', {
          title: 'Inactivity Detected',
          message: 'You have been inactive for over 5 minutes. Tracking has been paused.',
          icon: '⏸️',
          isStopped: false
        }).catch(() => {});
      }
    }, 10000);
  }

  recordUserActivity() {
    this.lastActivityTime = Date.now();
  }

  pauseTracking() {
    if (!this.isTracking || this.isPaused) return;
    this.isPaused = true;
    this.pauseStartPerfMs = performance.now();
    this.syncToDatabase();
    this.notify('tracking-pause', { duration: this.getCurrentTotalDuration() });
  }

  resumeTracking(deductIdle = false) {
    if (!this.isTracking || !this.isPaused) return;

    const pauseDurationMs = performance.now() - this.pauseStartPerfMs;
    this.pausedDuration += pauseDurationMs;
    this.pauseStartPerfMs = null;
    this.isPaused = false;
    this.lastActivityTime = Date.now();

    logger.info('Resumed tracking.');
    this.notify('tracking-resume', { duration: this.getCurrentTotalDuration() });
  }

  async stopTracking(deductIdleTime = false) {
    if (!this.isTracking) return;

    logger.info('Stopping tracker session...');
    this.isTracking = false;
    this.isPaused = false;

    // Clear loops
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.captureInterval) clearInterval(this.captureInterval);
    if (this.idleCheckInterval) clearInterval(this.idleCheckInterval);

    let finalDuration = this.getCurrentTotalDuration();

    if (deductIdleTime) {
      // Deduct the 5-minute inactivity threshold on idle stop
      finalDuration = Math.max(this.baseDuration, finalDuration - (IDLE_THRESHOLD_MS / 1000));
      logger.info(`Deducted 5m idle threshold. Final duration: ${finalDuration}s`);
    }

    this.baseDuration = finalDuration;
    this.sessionStartPerfMs = null;
    this.pausedDuration = 0;
    this.pauseStartPerfMs = null;

    // Persist final duration
    storageService.saveLocal(this.currentUser.id, this.currentDayCycle.dateString, {
      duration: finalDuration,
      timeEntryId: this.timeEntryId
    });

    if (this.timeEntryId) {
      try {
        await supabase
          .from('time_entries')
          .update({
            duration: finalDuration,
            status: 'stopped',
            end_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', this.timeEntryId);
      } catch (err) {
        logger.error('Error closing time entry on stop:', err);
      }
    }

    this.notify('tracking-stop', { duration: finalDuration });
  }

  startDayCycleMonitor() {
    if (this.dayCheckInterval) clearInterval(this.dayCheckInterval);
    this.dayCheckInterval = setInterval(async () => {
      if (!this.currentUser) return;

      const newCycle = getCurrentDayCycle();
      if (!this.currentDayCycle || this.currentDayCycle.dateString !== newCycle.dateString) {
        logger.info('Midnight Day Cycle rollover detected:', newCycle.dateString);
        const wasTracking = this.isTracking;

        if (wasTracking) {
          await this.stopTracking(false);
        }

        this.currentDayCycle = newCycle;
        this.baseDuration = 0;
        this.timeEntryId = null;

        await this.loadTodaySession();

        if (wasTracking) {
          await this.startTracking(this.selectedProjectId, this.selectedTaskId);
        }

        this.notify('day-cycle-reset', { dateString: newCycle.dateString });
      }
    }, 30000);
  }

  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  notify(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => {
        try { l.callback(data); } catch (_) {}
      });
  }

  cleanup() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.captureInterval) clearInterval(this.captureInterval);
    if (this.idleCheckInterval) clearInterval(this.idleCheckInterval);
    if (this.dayCheckInterval) clearInterval(this.dayCheckInterval);
    captureSettingsService.cleanup();
    this.listeners = [];
  }
}

module.exports = new TrackerEngine();
