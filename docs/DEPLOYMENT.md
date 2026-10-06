# Deployment

## Prerequisites

* Node 22, Java 21 (for the emulators), Firebase CLI (installed as a dev dependency).
* The Firebase project must be on the **Blaze** plan (Cloud Functions).

## Environment variables

| Where | Variable | Purpose |
|---|---|---|
| apps/web/.env.local (dev) / CI secrets (prod) | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID` | public web config |
| | `VITE_FUNCTIONS_REGION` | must match functions (`europe-west1`) |
| | `VITE_USE_EMULATORS` | `true` for local development |
| | `VITE_APPCHECK_SITE_KEY` | optional App Check key (recommended) |
| Functions runtime | `ENFORCE_APP_CHECK` | `true` once App Check is configured |

No private keys are needed: functions use the project's service identity.

## Local development

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # set VITE_USE_EMULATORS=true, VITE_FIREBASE_PROJECT_ID=demo-profjero
npm run build -w @profjero/functions
NODE_OPTIONS="--require $PWD/scripts/emulator-loopback-shim.cjs" npx firebase emulators:start --project demo-profjero
npm run dev                                     # http://localhost:5173
```

(The shim is only needed behind an HTTP proxy; it makes firebase-tools respect `NO_PROXY`
for emulator-to-emulator calls.)

## Checks

```bash
npm run rules:check     # generated rules are up to date
npm run typecheck
npm test                # unit tests
npm run test:emulator   # rules, functions and migration against emulators
npm run build
```

CI (`.github/workflows/ci.yml`) runs all of these on every pull request.

## Production cut-over (order matters)

The new security rules close the legacy collections, which stops the old app working. Deploy
in this order:

1. `npm run build`
2. `npx firebase deploy --only firestore:indexes` — wait until indexes finish building.
3. `npx firebase deploy --only functions`
4. `npx firebase deploy --only hosting` — the new app replaces the old one at the same URL.
5. `npx firebase deploy --only firestore:rules,storage` — **closes the legacy public access**
   (audit S1). From now on only the new app works.
6. Ask users to run Settings → Import and move their passwords into the vault.

Rollback: re-deploy the previous hosting release from the Firebase console. Do **not** roll back
the rules to the legacy (open) state.

## Backups and recovery

Enable Firestore point-in-time recovery and a scheduled export to Cloud Storage. Financial
records are never hard-deleted by the app (voiding keeps them), and every finance and
membership change is in the tenant's audit log.
