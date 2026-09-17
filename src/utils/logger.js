/**
 * Production Logger Utility for AuraTrack Desktop
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Default level: INFO in production, DEBUG if --dev or DEBUG=1
const currentLevel = (process.argv.includes('--dev') || process.env.DEBUG) ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
  debug: (...args) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(`[${getTimestamp()}] [DEBUG]`, ...args);
    }
  },
  info: (...args) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(`[${getTimestamp()}] [INFO]`, ...args);
    }
  },
  warn: (...args) => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(`[${getTimestamp()}] [WARN]`, ...args);
    }
  },
  error: (...args) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(`[${getTimestamp()}] [ERROR]`, ...args);
    }
  }
};

module.exports = {
  logger,
  LOG_LEVELS
};
