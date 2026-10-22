# ProfJero Workspace modernization plan

## Status and safety

The current app uses React + TypeScript, Firebase Auth, Firestore, Storage, and callable Cloud Functions. Existing finance and tenancy operations depend on server-side authorization, transactions, idempotency, and audit logs. **Update:** the cut-over is implemented. Every operation in `apps/functions/src` is served by the Worker (`apps/worker`) through a Firestore REST adapter, the web app calls the Worker when `VITE_WORKER_URL` is set, and the handler suites pass through the Worker (`npm run test:worker`). Firebase Functions no longer need to be deployed. See docs/DEPLOYMENT.md. The plan below is kept for history.

## Target architecture

- Keep React + TypeScript initially and redesign the experience in staged, tested screens.
- Retain Firebase Authentication at first, but verify Firebase ID tokens cryptographically in the Worker (signature/JWKS, issuer, audience, expiry). Never trust decoded claims or a user ID supplied in JSON.
- Reuse shared Zod schemas and permission rules. Enforce tenant membership and role permissions on every server route.
- Decide explicitly whether data remains in Firestore or migrates to Cloudflare D1. Do not silently mix stores. A D1 migration needs schema design, import/export, parity tests, backup, and rollback.
- Keep Firebase Storage initially or plan a controlled move to R2 with access-controlled uploads and downloads.
- Add rate limiting, payload limits, App Check validation where practical, redacted structured logs, request IDs, and alerts.

## Migration sequence

1. Inventory every callable function, trigger, secret, scheduled job, and frontend invocation. Map each to a Worker route and document request/response contracts.
2. Implement token verification, tenant membership, permission checks, Zod validation, idempotency, and append-only audit logging before any data route is enabled.
3. Port one low-risk read-only endpoint and add tests. Keep existing functions running during parity testing.
4. Port writes while preserving transaction semantics. Finance changes require concurrency, duplicate-request, refund, and reconciliation tests.
5. Switch the frontend API client behind a feature flag and test old and new paths against the same scenarios.
6. Port triggers/jobs and file access explicitly. Monitor latency, 4xx/5xx rates, auth failures, and reconciliation.
7. Run typecheck, unit tests, emulator tests, build, and Worker tests. Canary traffic before removing Firebase Functions configuration.
8. Maintain backups and a documented rollback path. Do not remove the current functions until no production caller depends on them.

## UI/UX direction

Use established patterns as inspiration, not as copied branding: Linear for fast workflows, Stripe Dashboard for financial clarity, Notion for flexible workspace content, GitHub for activity and administration, and Material Design 3 for accessible responsive behaviour. Build an original ProfJero signature with a consistent wordmark, restrained blue/green accents, readable typography, keyboard-friendly global search, useful empty states, and a subtle “Built by ProfJero” mark.

Redesign in sequence: login/signup and recovery; onboarding/workspace setup; Today dashboard; navigation and search; finance/reports; settings/team; then admin/operations. Preserve existing task flows and validate with real users.

## Admin and operations console

Create a separately guarded /admin area; a hidden client-side menu is not security. Require server-verified super-admin access and MFA for privileged operators. Include service health, deployment version, API latency/error rates, user/workspace status with minimal metadata, audit-log search by request ID/actor/tenant/action/time, failed jobs and idempotent retries, reconciliation status, feature flags, rate-limit events, and export/deletion requests. Capture a reason and immutable audit entry for role changes and account actions. Never log passwords, access tokens, vault plaintext, secrets, or full financial records. Apply least privilege and audit support access.

## Personal financial allocation structures

Allow users to define named buckets (e.g. Tithe 10%, Food & Daily Upkeep 25%, savings, emergency fund, business), percentages, order, active state, and optional caps. Validate finite non-negative percentages and require active buckets to total 100%, unless the user explicitly chooses an unallocated remainder. Version configurations and preserve the allocation snapshot for past distributions. Calculate in integer minor currency units and distribute rounding residuals deterministically so bucket totals equal the original income exactly. Show a preview before saving/applying. A planned allocation must not be represented as a real bank transaction or move money automatically. Test tiny amounts, rounding, edits, disabled buckets, and large amounts.

## Analytics and data-mining guardrails

Provide personal insights from records a workspace owner is authorised to access: category trends, budgets, recurring expenses, cash-flow projections, and user-requested exports. Platform operations analytics should use aggregate counts and latency/error metrics, not financial content. Do not sell identifiable user records, transaction histories, notes, client data, or password-vault content. Any future aggregate research or commercial analytics requires clear opt-in consent, purpose limitation, aggregation/de-identification, minimum cohort thresholds, retention controls, export/deletion processes, and a Ghana Data Protection Act 2012 (Act 843) review. Data mining must not mean secretly harvesting customers' private data.

## Production acceptance gates

- Every API route verifies identity, tenant scope, permissions, and input schema.
- Existing ledger invariants and emulator tests have equivalent Worker-side coverage.
- Cross-tenant access, privilege escalation, replay/idempotency, concurrency, and malformed-input tests pass.
- Financial allocations reconcile exactly to the source income.
- Admin actions are MFA-protected, least-privilege, and audited.
- Privacy notice, retention policy, export/deletion flows, and consent for optional analytics are in place.
- Typecheck, unit tests, emulator tests, build, and Worker tests pass.