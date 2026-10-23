export interface Env {
  /** "development" | "staging" | "production". Emulator settings are rejected in production. */
  APP_ENV: string;
  /** Comma-separated list of exact browser origins allowed to call the API. */
  WEB_ORIGINS?: string;
  /** Deprecated single-origin form of WEB_ORIGINS (still honoured). */
  WEB_ORIGIN?: string;
  FIREBASE_PROJECT_ID: string;
  /** Service-account JSON (secret). Needs the "Cloud Datastore User" role. Not needed with emulators. */
  FIREBASE_SERVICE_ACCOUNT?: string;
  /** Optional: Firebase project NUMBER; when set, App Check tokens are required. */
  APPCHECK_PROJECT_NUMBER?: string;
  /** Local development only, e.g. "127.0.0.1:8080" / "127.0.0.1:9099". */
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
  /** Optional Workers rate-limit binding for the unauthenticated client-portal routes. */
  PORTAL_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}
