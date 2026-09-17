# AuraTrack Desktop — Enterprise Time Tracker

<div align="center">

![AuraTrack Desktop](https://img.shields.io/badge/AuraTrack_Desktop-v1.6.2-6366f1?style=for-the-badge&logo=electron&logoColor=white)
![Electron](https://img.shields.io/badge/Electron_28-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows_%7C_macOS-blue?style=for-the-badge)

<p align="center">
  <b>AuraTrack Desktop</b> is the companion desktop tracking client for the <b>AuraTrack Time Intelligence Platform</b>. It provides seamless background time tracking, automated multi-monitor screenshots, webcam verification, intelligent inactivity detection, offline caching, and centralized version governance.
</p>

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Modular Architecture](#-modular-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development Mode](#development-mode)
  - [Building & Packaging](#building--packaging)
- [Core Subsystems](#-core-subsystems)
  - [1. Authentication & Azure SSO](#1-authentication--azure-sso)
  - [2. Time Tracking Engine & Day Cycles](#2-time-tracking-engine--day-cycles)
  - [3. Idle & Power State Detection](#3-idle--power-state-detection)
  - [4. Multi-Display Screenshots & Webcam](#4-multi-display-screenshots--webcam)
  - [5. Centralized Version Management](#5-centralized-version-management)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)
- [License](#-license)

---

## 🌟 Overview

AuraTrack Desktop runs natively on Windows and macOS. It communicates directly with the Supabase database shared with the **AuraTrack Web Dashboard**, respecting real-time administrative toggles for screenshots, webcam captures, and minimum app version requirements.

---

## 🚀 Key Features

- 🔐 **Azure Active Directory / Microsoft Entra ID SSO**: One-click authentication with local HTTP OAuth server and browser callback handlers.
- ⏱️ **Resilient Time Tracking Engine**: High-accuracy monotonic timer with monotonic duration tracking that prevents clock drift and double counting.
- 🔄 **Automated Day-Cycle Transitions**: Automatic IST/UTC day-cycle cutover handling so sessions never cross into incorrect days.
- 💾 **Offline Cache & Dual-Sync**: Local storage fallback with automatic background synchronization when internet connectivity resumes.
- 🛑 **Smart Idle & Power Event Detection**: Detects user inactivity (mouse/keyboard), screen lock, system sleep, shutdown, and Windows session switches with an interactive overlay prompt.
- 📸 **Multi-Monitor Screenshots & Webcam Capture**: Automatic capture linked to active time entries, respecting per-user administrative toggles.
- 👤 **On-Device Face Verification**: Local TensorFlow.js / Face-API models verify worker presence during camera checks.
- 🛡️ **Centralized Version Enforcement**: Validates app version against `system_settings.tracker_required_version` on startup and alerts users if updates are required.

---

## 🏗️ Modular Architecture

The desktop application is divided into specialized modules for maintainability:

```
AuraTrack-App/
├── src/
│   ├── config/
│   │   └── supabase.js             # Supabase client singleton & configuration
│   ├── utils/
│   │   ├── logger.js               # Structured logger (debug, info, warn, error)
│   │   ├── timeUtils.js            # Day cycle logic (IST/UTC), monotonic clocks, duration formatters
│   │   └── systemActivity.js       # Windows/Mac idle detection & power monitoring utilities
│   ├── services/
│   │   ├── authService.js          # Authentication (Email & Azure SSO flow)
│   │   ├── versionService.js       # Remote version checks & telemetry logging
│   │   ├── captureSettingsService.js # Admin capture toggles & Realtime subscriptions
│   │   ├── storageService.js       # LocalStorage manager, offline queuing, and Supabase sync
│   │   ├── projectService.js       # User-assigned projects and tasks loader
│   │   ├── screenshotService.js    # Multi-display capture and image compression
│   │   ├── cameraService.js        # Webcam streaming, capture & face detection
│   │   └── trackerEngine.js        # Core tracking lifecycle (Start, Pause, Resume, Stop)
│   └── main/
│       ├── oauthServer.js          # Local HTTP callback listener for Azure SSO
│       ├── powerMonitor.js         # System lock, suspend, shutdown event listener
│       └── windowManager.js        # Main and overlay window lifecycle
├── assets/                         # Application logos, models, and icons
├── build/                          # Windows and macOS build icons and packaging resources
├── index.html                      # Main tracking dashboard interface
├── overlay.html                    # Inactivity & pause overlay modal
├── styles.css                      # Modern desktop theme styles
├── main.js                         # Electron main process orchestrator
├── renderer.js                     # Electron renderer process UI controller
└── package.json                    # Dependencies and build configuration
```

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Runtime & Shell** | [Electron 28](https://www.electronjs.org/), [Node.js](https://nodejs.org/) |
| **Backend & Realtime** | [@supabase/supabase-js](https://supabase.com/) |
| **Screen Capture** | [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) |
| **Image Processing** | [sharp](https://sharp.pixelplumbing.com/) |
| **AI & Face Detection** | [TensorFlow.js](https://www.tensorflow.org/js), [face-api.js](https://github.com/justadudewhohacks/face-api.js) |
| **Packager & Installer** | [electron-builder](https://www.electron.build/) (NSIS, Portable, DMG) |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ or v20+
- **npm**: v9+
- Python & C++ Build Tools (required for compiling native dependencies like `sharp`)

### Installation

```bash
# Clone and enter directory
cd "AuraTrack-App"

# Install dependencies
npm install
```

### Development Mode

```bash
# Run the application in development mode
npm run dev
```

### Building & Packaging

```bash
# Build Windows installer (NSIS & Portable)
npm run build:win

# Build macOS DMG & Zip
npm run build:mac

# Build all targets
npm run build:all
```

Packaged installers and executables are output to the `release/` directory.

---

## ⚙️ Core Subsystems

### 1. Authentication & Azure SSO
- Opens the system default browser for enterprise Azure AD login.
- A temporary local HTTP server listening on port `54321` captures the OAuth callback redirect and securely hands tokens to the desktop client.

### 2. Time Tracking Engine & Day Cycles
- High-accuracy monotonic timing prevents OS clock adjustments from altering recorded work duration.
- Day cycles automatically reset at midnight IST (00:00 - 23:59:59), archiving previous day entries cleanly.

### 3. Idle & Power State Detection
- If no keyboard or mouse activity is detected for 5 minutes, tracking pauses and the **Inactivity Overlay** displays.
- Users can click **Continue** (to resume without deduction) or **Stop** (to deduct idle time and save).
- System sleep, screen lock, and logout events trigger an automated graceful stop and database sync.

### 4. Multi-Display Screenshots & Webcam
- Supports multiple monitors simultaneously.
- Compresses captured screens to efficient PNG/WebP files.
- Reads `profiles.enable_screenshot_capture` and `profiles.enable_camera_capture` from Supabase to disable monitoring when configured by administrators.

### 5. Centralized Version Management
- Queries `system_settings.tracker_required_version` on startup.
- If `tracker_force_update` is enabled and the app version is outdated, tracking is blocked and a direct download button opens `tracker_update_url`.

---

## ❓ Troubleshooting & FAQs

### Camera Not Detected
- Ensure camera access permissions are enabled in Windows Settings > Privacy & Security > Camera.
- Verify no other application is locking the webcam stream in exclusive mode.

### Windows SmartScreen Prompt
- For unsigned development builds, click **More Info** > **Run Anyway**. For production, sign executables with an EV Code Signing Certificate.

---

## 📄 License

MIT License. Developed by AuraTrack Core Team.
