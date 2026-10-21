# Deployment

## Target architecture (no Firebase Blaze requirement)

The target production architecture deploys privileged server operations to **Cloudflare Workers**.
Firebase Authentication, Firestore, and Storage may remain in use; Firebase Cloud Functions must
not be part of the final runtime or deployment pipeline. Cloudflare Workers are deployed with
Wrangler and do not require the Firebase Blaze plan.

**Migration warning:** this branch is still in progress. Only Worker health, verified Firebase
identity, and active membership lookup are implemented. Other `/v1/*` operations intentionally
return `501 NOT_IMPLEMENTED`; the legacy Functions are still configured while their business
logic is ported. Do not cut over or remove the old functions until all operations below are
ported and the checks pass.

## Prerequisites

- Node.js 22 or compatible current LTS
- Cloudflare account with Workers access and Wrangler authentication
- Firebase project with Authentication, Firestore, and (if used) Storage enabled
- A dedicated Google service account with least-privilege Firestore access for the Worker

## Worker environment

Set Cloudflare Worker variables:

- `APP_ENV=production`
- `WEB_ORIGIN=https://your-actual-app-domain.example` (replace with the real frontend origin)
- `FIREBASE_PROJECT_ID=profjero` (or your actual Firebase project ID)

Set the private service account JSON using a Cloudflare secret, not a committed variable:

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
```

Paste the JSON value when prompted. Never expose this credential in the browser or repository.
The web app currently still uses its legacy Firebase callable client until the route migration is
complete; the Worker API is not yet a replacement for all operations.

## Local development

```bash
npm install
npm run worker:dev
```

For local Worker secrets, use an ignored `.dev.vars` file in `apps/worker` and ensure it is not
committed. The Firebase emulators remain useful for Auth/Firestore rule testing, but Cloud
Functions emulator tests will be retired after the Worker parity suite replaces them.

## Checks

```bash
npm run worker:typecheck
npm run rules:check
npm run typecheck
npm test
npm run build
```

Before cut-over, add Worker tests for all callable operations, including authorization failures,
cross-tenant access, idempotency/replay, concurrency, finance ledger invariants, invoice lifecycle,
and migration/import behaviour. Compare results with existing tests.

## Final cut-over checklist

Do not perform the following until all old callables have equivalent Worker routes and the frontend
uses the Worker API:

1. Switch the frontend action client to the Worker base URL and pass Firebase ID tokens.
2. Run end-to-end parity tests for tenant membership, invitations, finance, invoices, and import.
3. Update CI to typecheck/test/build the Worker and remove Functions build/test steps.
4. Remove the `functions` section and Functions emulator from `firebase.json`.
5. Remove `apps/functions`, `firebase-functions`, `firebase-admin` usage from the app workspace,
   and all `VITE_FUNCTIONS_REGION` / callable-client imports.
6. Remove Cloud Functions hostnames from the frontend CSP if no other Firebase service needs them.
7. Deploy the Worker and frontend, verify production logs/health, and reconcile finance totals.
8. Only then delete the old Functions deployment from Firebase. Keep backups and a rollback plan.

## Data safety

Financial writes must remain transactional, idempotent, and auditable. Use integer minor units and
preserve the existing shared finance schemas and business rules. Never treat a successful HTTP
response as a completed financial mutation unless the Firestore transaction committed. Do not log
tokens, vault plaintext, service-account credentials, or complete financial records.
