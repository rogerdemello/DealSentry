/**
 * Minimal leveled logger for the API layer.
 *
 * - debug: developer diagnostics; silenced in production and tests.
 * - info:  operational messages; silenced in tests to keep output clean.
 * - warn / error: always emitted.
 *
 * Never pass secrets (tokens, passwords, credentials) to any level.
 */

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = {
  debug: (...args: unknown[]): void => {
    if (!isProduction && !isTest) console.log(...args);
  },
  info: (...args: unknown[]): void => {
    if (!isTest) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
