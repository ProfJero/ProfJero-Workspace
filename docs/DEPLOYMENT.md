# Deployment (Cloudflare Pages + Cloudflare Worker + Firebase)

```
Browser ──► Cloudflare Pages (apps/web/dist, static React app + _headers)
   │
   ├──► Firebase Auth            sign-in, ID tokens
   ├──► Firestore (SDK)          live reads + workspace writes, protected by firebase/firestore.rules
   ├──► Firebase Storage (SDK)   Study Companion files, protected by firebase/storage.rules
   └──► Cloudflare Worker API    every privileged / financial operation (apps/worker)
            └──► Firestore REST API with a service account (transactions, audit log)
```

Firebase Functions are **not required**. `apps/functions/src` remains the single source of the
server handlers; the Worker runs that same code through its Firestore adapter.

## One-time setup

### 1. Firebase (rules, indexes, auth)

```bash
npm ci
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes,storage --project profjero
```

* **Indexes**: open Firebase console → Firestore → *Indexes* and wait until all 12 show *Enabled*
  (a few minutes). Until then, screens that need them show "a database index is missing or still
  being built" — this was the cause of the *"We couldn't load your workspaces"* error.
* **Authentication → Settings → Authorized domains**: add `profjero-workspace.pages.dev` and any
  custom domain. Without this, Google sign-in fails on the Pages site.
* **Storage**: projects whose bucket ends in `.firebasestorage.app` need the Blaze (pay-as-you-go)
  plan for Cloud Storage; it has a free monthly allowance. Without it, Study Companion uploads fail
  (everything else works).

### 2. Service account for the Worker

Google Cloud console → IAM & Admin → Service accounts → *Create* `profjero-worker`, role
**Cloud Datastore User** (nothing broader). Create a JSON key, then:

```bash
cd apps/worker
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --env production   # paste the whole JSON
rm path/to/key.json                                                  # do not keep or commit it
```

### 3. Deploy the Worker

```bash
cd apps/worker
npx wrangler deploy --env production
curl https://profjero-workspace-api.<your-subdomain>.workers.dev/health
```

Edit `WEB_ORIGINS` in `wrangler.toml` (`[env.production.vars]`) to list every origin that serves
the web app (the `pages.dev` URL and any custom domain), comma-separated, then redeploy.

**Plan:** use **Workers Paid**. The free plan's limits (10 ms CPU and 50 subrequests per request)
are too tight for multi-document financial transactions, reconciliation and the legacy import.

### 4. Cloudflare Pages

Project settings:

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build -w @profjero/web` |
| Build output directory | `apps/web/dist` |
| Root directory | *(repository root)* |
| Node version | `NODE_VERSION=22` |

Environment variables (Production):

| Variable | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID` | from `apps/web/.env.example` |
| `VITE_WORKER_URL` | `https://profjero-workspace-api.<your-subdomain>.workers.dev` |
| `VITE_USE_EMULATORS` | `false` |
| `VITE_APPCHECK_SITE_KEY` | optional (see below) |

The build writes `dist/_headers` with the Content-Security-Policy (allowing exactly
`VITE_WORKER_URL`), frame/sniff/referrer/HSTS headers and asset caching. Pages serves
`index.html` for app routes automatically.

### 5. Recommended hardening

* **App Check**: create a reCAPTCHA Enterprise key, enable App Check for the web app, set
  `VITE_APPCHECK_SITE_KEY` in Pages and uncomment `APPCHECK_PROJECT_NUMBER` in `wrangler.toml`.
* **Rate limit** the public client-portal routes: uncomment the `PORTAL_RATE_LIMITER` binding.
* Restrict the Firebase browser API key to your domains (Google Cloud → Credentials).
* Firestore point-in-time recovery and scheduled exports (backups).

## Every release

```bash
npm run rules:check && npm run typecheck && npm test   # fast checks
npm run test:emulator    # rules + handlers on the Firebase emulators
npm run test:worker      # the same handler suites through the Worker (wrangler dev)
npm run build
npx firebase deploy --only firestore:rules,firestore:indexes,storage   # if rules/indexes changed
(cd apps/worker && npx wrangler deploy --env production)               # deploy API before the web app
# Pages builds the web app from the main branch automatically.
```

Order matters when operations change: deploy **indexes → Worker → web app**.

## Local development

```bash
cp apps/web/.env.example apps/web/.env.local
# set VITE_USE_EMULATORS=true, VITE_FIREBASE_PROJECT_ID=demo-profjero, VITE_WORKER_URL=http://127.0.0.1:8787
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
npx firebase emulators:start --only auth,firestore,storage --project demo-profjero
(cd apps/worker && npx wrangler dev)
npm run dev
```

Behind an HTTP proxy, start the emulators with
`NODE_OPTIONS="--require $PWD/scripts/emulator-loopback-shim.cjs"`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "A database index is missing or still being built" | deploy indexes (step 1) and wait for *Enabled*; the browser console logs Firestore's create-index link |
| "This site is not allowed to use the API" | the site's origin is missing from `WEB_ORIGINS` |
| "Something went wrong on our side" on every action | `FIREBASE_SERVICE_ACCOUNT` missing/invalid or lacks *Cloud Datastore User*; check `npx wrangler tail --env production` (logs carry a request id) |
| "Your session has expired" | `FIREBASE_PROJECT_ID` in the Worker does not match the web app's project |
| Google sign-in popup fails | domain not in Firebase Auth *Authorized domains* |
| Blank page / blocked requests | a Content-Security-Policy violation — check the browser console; rebuild after changing `VITE_WORKER_URL` |
