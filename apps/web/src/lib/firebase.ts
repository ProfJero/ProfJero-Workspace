import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const env = import.meta.env;

function required(name: string): string {
  const v = env[name] as string | undefined;
  if (!v) throw new Error(`Missing environment variable ${name}. Copy apps/web/.env.example to apps/web/.env.local.`);
  return v;
}

export const app = initializeApp({
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
  appId: required('VITE_FIREBASE_APP_ID'),
});

if (env.VITE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

export const auth = getAuth(app);

/**
 * Offline cache: workspace data (tasks, notes, …) stays readable offline and
 * edits sync when the connection returns. Finance writes go through Cloud
 * Functions and are never queued offline (see useAction).
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'europe-west1');
export const storage = getStorage(app);

if (env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
