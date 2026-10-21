# ProfJero Workspace API (Cloudflare Workers)

This service is the target replacement for Firebase Cloud Functions. Firebase Authentication,
Firestore and Storage remain data/identity services; **no Firebase Cloud Functions deployment
is required** once every callable operation has been ported and the web client switched to this API.

## Secrets and bindings

Configure these in the Cloudflare Worker environment (never commit the service account JSON):

- `FIREBASE_PROJECT_ID`: Firebase project ID.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON for a dedicated Google service account with the minimum
  Firestore permissions needed by this API. Store it with `wrangler secret put`, not in vars.
- `WEB_ORIGIN`: exact allowed production origin.
- Optional `RATE_LIMIT`: Cloudflare rate-limit binding if configured.

The service account is used only by the Worker. Browser clients must never receive its credentials.
Create a dedicated service account and grant only required Firestore access. Rotate its key if exposed.

## Local development

Set non-secret values in `wrangler.toml` and add the service account using a local ignored
`.dev.vars` file or `wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON`. Do not commit secrets.

## Migration status

The API must not be treated as production-ready until all existing operations are implemented
using Firestore REST transactions, Firebase ID tokens are verified against Google's X.509 public
certificates, every request checks current membership/role, and the frontend has been switched
to the Worker. Finance writes require idempotency, transactional balance updates and audit records.
