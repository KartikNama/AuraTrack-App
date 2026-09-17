/**
 * AuraTrack Desktop - Renderer UI Controller
 * High-level event orchestration, view rendering, and user interactions
 */

const { ipcRenderer, shell } = require('electron');
const authService = require('./src/services/authService');
const versionService = require('./src/services/versionService');
const projectService = require('./src/services/projectService');
const trackerEngine = require('./src/services/trackerEngine');
const cameraService = require('./src/services/cameraService');
const { formatDuration } = require('./src/utils/timeUtils');
const { logger } = require('./src/utils/logger');
const pkg = require('./package.json');

// DOM Elements
const loadingContainer = document.getElementById('loading-container');
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');

// Login Elements
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const errorMessage = document.getElementById('error-message');
const minimizeBtnLogin = document.getElementById('minimize-btn-login');
const closeBtnLogin = document.getElementById('close-btn-login');

// Dashboard Elements
const userNameSpan = document.getElementById('user-name');
const versionText = document.getElementById('version-text');
const logoutBtn = document.getElementById('logout-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');

// Tracking Controls
const projectSelect = document.getElementById('project-select');
const taskSelect = document.getElementById('task-select');
const taskNameDisplay = document.getElementById('task-name');
const taskTagDisplay = document.getElementById('task-tag');
const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusDisplay = document.getElementById('status');

// Modals
const updateModal = document.getElementById('update-required-modal');
const updateMessage = document.getElementById('update-message');
const downloadUpdateBtn = document.getElementById('download-update-btn');
const closeAppBtn = document.getElementById('close-app-btn');

const cameraModal = document.getElementById('camera-detection-modal');
const cameraModalTitle = document.getElementById('camera-modal-title');
const cameraModalMessage = document.getElementById('camera-message');
const cameraRetryBtn = document.getElementById('camera-retry-btn');
const closeCameraModalBtn = document.getElementById('close-camera-modal-btn');

let projectsList = [];
let tasksList = [];
let updateDownloadUrl = null;

// ==============================================================================
// Application Lifecycle & Initialization
// ==============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  logger.info(`AuraTrack Desktop v${pkg.version} loaded.`);
  bindEventListeners();
  bindEngineEvents();

  if (versionText) {
    versionText.textContent = `v${pkg.version}`;
  }

  // Check existing session
  const session = await authService.getSession();
  if (session && session.user) {
    await handleLoginSuccess(session.user);
  } else {
    showLoginView();
  }
});

function bindEventListeners() {
  // Window controls
  minimizeBtnLogin?.addEventListener('click', () => ipcRenderer.invoke('minimize-window'));
  closeBtnLogin?.addEventListener('click', () => ipcRenderer.invoke('close-window'));
  minimizeBtn?.addEventListener('click', () => ipcRenderer.invoke('minimize-window'));
  closeBtn?.addEventListener('click', () => ipcRenderer.invoke('close-window'));

  // Auth
  loginForm?.addEventListener('submit', handleEmailLogin);
  logoutBtn?.addEventListener('click', handleLogout);

  // Project & Task selection
  projectSelect?.addEventListener('change', onProjectChanged);
  taskSelect?.addEventListener('change', onTaskChanged);

  // Tracking controls
  startBtn?.addEventListener('click', onStartClicked);
  stopBtn?.addEventListener('click', onStopClicked);

  // Update modal actions
  downloadUpdateBtn?.addEventListener('click', () => {
    if (updateDownloadUrl) shell.openExternal(updateDownloadUrl);
  });
  closeAppBtn?.addEventListener('click', () => ipcRenderer.invoke('close-window'));

  // Camera modal actions
  cameraRetryBtn?.addEventListener('click', () => {
    cameraModal?.classList.add('hidden');
    onStartClicked();
  });
  closeCameraModalBtn?.addEventListener('click', () => {
    cameraModal?.classList.add('hidden');
  });

  // User activity listeners (to reset idle detector)
  const activityHandler = () => trackerEngine.recordUserActivity();
  window.addEventListener('mousemove', activityHandler, { passive: true });
  window.addEventListener('keydown', activityHandler, { passive: true });
  window.addEventListener('mousedown', activityHandler, { passive: true });
}

function bindEngineEvents() {
  trackerEngine.on('tick', ({ formatted }) => {
    if (timerDisplay) timerDisplay.textContent = formatted;
  });

  trackerEngine.on('tracking-start', () => {
    startBtn?.classList.add('hidden');
    stopBtn?.classList.remove('hidden');
    if (statusDisplay) {
      statusDisplay.textContent = 'Tracking Active';
      statusDisplay.classList.add('tracking');
    }
  });

  trackerEngine.on('tracking-stop', ({ duration }) => {
    stopBtn?.classList.add('hidden');
    startBtn?.classList.remove('hidden');
    if (timerDisplay) timerDisplay.textContent = formatDuration(duration);
    if (statusDisplay) {
      statusDisplay.textContent = 'Not Tracking';
      statusDisplay.classList.remove('tracking');
    }
  });

  trackerEngine.on('tracking-pause', () => {
    if (statusDisplay) {
      statusDisplay.textContent = 'Paused (Inactive)';
      statusDisplay.classList.remove('tracking');
    }
  });

  trackerEngine.on('tracking-resume', () => {
    if (statusDisplay) {
      statusDisplay.textContent = 'Tracking Active';
      statusDisplay.classList.add('tracking');
    }
  });

  trackerEngine.on('duration-update', ({ duration }) => {
    if (timerDisplay) timerDisplay.textContent = formatDuration(duration);
  });
}

// ==============================================================================
// Authentication & Dashboard Setup
// ==============================================================================

async function handleEmailLogin(e) {
  if (e) e.preventDefault();
  const email = emailInput?.value?.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showError('Please enter both email and password.');
    return;
  }

  showError('');
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
  }

  try {
    const result = await authService.loginWithEmail(email, password);
    if (result.success) {
      await handleLoginSuccess(result.user);
    } else {
      showError(result.error || 'Invalid email or password.');
    }
  } catch (err) {
    showError(err.message || 'Login failed.');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  }
}

async function handleLoginSuccess(user) {
  // Validate Version Requirement
  const versionCheck = await versionService.checkTrackerVersion(pkg.version, user.id);
  if (!versionCheck.isCompatible && versionCheck.forceUpdate) {
    showUpdateModal(versionCheck.requiredVersion, versionCheck.updateUrl);
    return;
  }

  // Record startup usage
  await versionService.trackVersionUsage(user.id, pkg.version);

  // Display user name
  const profile = authService.getProfile();
  if (userNameSpan) {
    userNameSpan.textContent = profile?.full_name || profile?.email || user.email || 'User';
  }

  // Initialize tracking engine
  await trackerEngine.initializeUser(user);

  // Load user projects
  await loadProjects(user.id);

  showDashboardView();
}

async function handleLogout() {
  if (trackerEngine.isTracking) {
    await trackerEngine.stopTracking(false);
  }
  trackerEngine.cleanup();
  await authService.logout();
  if (passwordInput) passwordInput.value = '';
  showLoginView();
}

// ==============================================================================
// Projects & Tasks
// ==============================================================================

async function loadProjects(userId) {
  projectsList = await projectService.fetchProjectsForUser(userId);

  if (projectSelect) {
    projectSelect.innerHTML = '<option value="">Select a project...</option>';
    projectsList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      projectSelect.appendChild(opt);
    });

    if (projectsList.length === 1) {
      projectSelect.value = projectsList[0].id;
      onProjectChanged({ target: projectSelect });
    }
  }
}

async function onProjectChanged(e) {
  const projectId = e.target.value;
  if (!projectId) {
    if (taskSelect) {
      taskSelect.innerHTML = '<option value="">Select a task...</option>';
      taskSelect.disabled = true;
    }
    updateStartButton();
    return;
  }

  const selectedProj = projectsList.find(p => p.id === projectId);
  if (taskTagDisplay && selectedProj) {
    taskTagDisplay.textContent = selectedProj.name;
  }

  tasksList = await projectService.fetchTasksForProject(projectId);
  if (taskSelect) {
    taskSelect.innerHTML = '<option value="">Select a task...</option>';
    tasksList.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      taskSelect.appendChild(opt);
    });
    taskSelect.disabled = false;

    if (tasksList.length === 1) {
      taskSelect.value = tasksList[0].id;
      onTaskChanged({ target: taskSelect });
    }
  }
  updateStartButton();
}

function onTaskChanged(e) {
  const taskId = e.target.value;
  const selectedTask = tasksList.find(t => t.id === taskId);
  if (taskNameDisplay && selectedTask) {
    taskNameDisplay.textContent = selectedTask.name;
  }
  updateStartButton();
}

function updateStartButton() {
  const canStart = Boolean(projectSelect?.value && taskSelect?.value);
  if (startBtn) {
    startBtn.disabled = !canStart;
  }
}

// ==============================================================================
// Tracking Triggers
// ==============================================================================

async function onStartClicked() {
  const projectId = projectSelect?.value;
  const taskId = taskSelect?.value;
  if (!projectId || !taskId) return;

  // Verify Camera Hardware & Permissions
  const camHardware = await cameraService.detectHardware();
  if (!camHardware.detected) {
    showCameraModal('Camera Required', 'No camera device detected. Please connect a webcam to start tracking.');
    return;
  }

  const camPerm = await cameraService.checkPermission();
  if (!camPerm.granted) {
    showCameraModal('Permission Required', 'Camera permission was denied. Please allow access in system settings.');
    return;
  }

  await trackerEngine.startTracking(projectId, taskId);
}

async function onStopClicked() {
  await trackerEngine.stopTracking(false);
}

// ==============================================================================
// View Helpers & Modals
// ==============================================================================

function showLoginView() {
  loadingContainer?.classList.add('hidden');
  dashboardContainer?.classList.add('hidden');
  loginContainer?.classList.remove('hidden');
}

function showDashboardView() {
  loadingContainer?.classList.add('hidden');
  loginContainer?.classList.add('hidden');
  dashboardContainer?.classList.remove('hidden');
}

function showError(msg) {
  if (errorMessage) {
    errorMessage.textContent = msg || '';
    errorMessage.style.color = '#ef4444';
  }
}

function showUpdateModal(requiredVersion, downloadUrl) {
  updateDownloadUrl = downloadUrl;
  if (updateMessage) {
    updateMessage.textContent = `AuraTrack v${requiredVersion} or higher is required. Please update to continue tracking.`;
  }
  updateModal?.classList.remove('hidden');
}

function showCameraModal(title, msg) {
  if (cameraModalTitle) cameraModalTitle.textContent = title;
  if (cameraModalMessage) cameraModalMessage.textContent = msg;
  cameraModal?.classList.remove('hidden');
}