const LOG_BUFFER_SIZE = 100;
const logBuffer = [];

/**
 * Structured log entry with timestamp, level, component, and message.
 */
function log(level, component, message) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
  };

  const line = `${entry.timestamp} | ${component.padEnd(20)} | ${level.padEnd(5)} | ${message}`;

  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }

  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

function info(component, message) {
  log("INFO", component, message);
}

function warn(component, message) {
  log("WARN", component, message);
}

function error(component, message) {
  log("ERROR", component, message);
}

function getRecentLogs() {
  return [...logBuffer];
}

module.exports = { info, warn, error, getRecentLogs };
