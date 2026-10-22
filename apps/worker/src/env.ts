export interface Env {
  APP_ENV: string;
  WEB_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  /** Service-account JSON as a string. Set via `wrangler secret put FIREBASE_SERVICE_ACCOUNT`. */
  FIREBASE_SERVICE_ACCOUNT: string;
}