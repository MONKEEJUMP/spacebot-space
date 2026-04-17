/**
 * Structured JSON logger for LUCY and other services.
 *
 * Emits one JSON object per log line on stdout/stderr so it can be
 * ingested by log aggregators, PM2 logs, and grep pipelines.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Decompose started', { botName, phase: 'decompose', queryId });
 *   logger.error('Cerebras call failed', { error: err.message, retryCount });
 *
 * Levels: debug | info | warn | error
 * LOG_LEVEL env var controls minimum level (default: info).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

const MIN_LEVEL = resolveMinLevel();
const MIN_PRIORITY = LEVEL_PRIORITY[MIN_LEVEL];

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= MIN_PRIORITY;
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    // Handle circular references
    const seen = new WeakSet<object>();
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value as object)) return '[Circular]';
        seen.add(value as object);
      }
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      return value;
    });
  }
}

function emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const record: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    message,
  };
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      // Don't overwrite reserved fields
      if (k === 'level' || k === 'timestamp' || k === 'message') continue;
      record[k] = v;
    }
  }
  const line = safeStringify(record);
  if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    process.stderr.write(line + '\n');
  } else {
    // eslint-disable-next-line no-console
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>): void {
    emit('debug', message, data);
  },
  info(message: string, data?: Record<string, unknown>): void {
    emit('info', message, data);
  },
  warn(message: string, data?: Record<string, unknown>): void {
    emit('warn', message, data);
  },
  error(message: string, data?: Record<string, unknown>): void {
    emit('error', message, data);
  },
};

export type Logger = typeof logger;
