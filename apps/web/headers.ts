/**
 * Generates Cloudflare Pages `_headers` at build time. The CSP's connect-src
 * names the exact API origin from VITE_WORKER_URL instead of a wildcard.
 */
export function pagesHeaders(env: Record<string, string>): string {
  const api = env.VITE_WORKER_URL ? new URL(env.VITE_WORKER_URL).origin : '';
  const emulators = env.VITE_USE_EMULATORS === 'true' ? 'http://127.0.0.1:* ws://127.0.0.1:*' : '';
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN ? `https://${env.VITE_FIREBASE_AUTH_DOMAIN}` : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://apis.google.com https://www.gstatic.com https://www.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self' ${api} https://*.googleapis.com https://firebasestorage.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.google.com ${emulators}`.replace(/\s+/g, ' ').trim(),
    `frame-src ${authDomain} https://accounts.google.com https://www.google.com https://recaptcha.google.com`.replace(/\s+/g, ' ').trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return `/*
  Content-Security-Policy: ${csp}
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
`;
}
