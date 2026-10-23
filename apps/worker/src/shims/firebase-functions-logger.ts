// Worker stand-in for 'firebase-functions/logger': structured JSON lines (visible in `wrangler tail`).
const log = (severity: string) => (message: string, data?: Record<string, unknown>) =>
  console.log(JSON.stringify({ severity, message, ...(data ?? {}) }));
export const debug = log('DEBUG');
export const info = log('INFO');
export const warn = log('WARNING');
export const error = log('ERROR');
