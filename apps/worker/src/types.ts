export interface Env {
  APP_ENV: string;
  WEB_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}
