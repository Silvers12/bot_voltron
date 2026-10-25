import { config } from './config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold = order[(config.logLevel as Level) in order ? (config.logLevel as Level) : 'info'];

function log(level: Level, scope: string, message: string, extra?: unknown) {
  if (order[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  extra === undefined ? fn(line) : fn(line, extra);
}

/** Journal minimal avec portée par module. */
export function createLogger(scope: string) {
  return {
    debug: (msg: string, extra?: unknown) => log('debug', scope, msg, extra),
    info: (msg: string, extra?: unknown) => log('info', scope, msg, extra),
    warn: (msg: string, extra?: unknown) => log('warn', scope, msg, extra),
    error: (msg: string, extra?: unknown) => log('error', scope, msg, extra),
  };
}
