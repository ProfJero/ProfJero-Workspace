# Security

## Controls

| Threat | Control | Verified by |
|---|---|---|
| Reading/writing another tenant's data (IDOR, forged tenantId) | Data under `tenants/{id}`; rules require an active membership doc for `request.auth.uid`; functions load membership from the DB | `rules.test.ts` “tenant isolation”, `functions.test.ts` “cross-tenant attacks” |
| Self-granted membership / role escalation | Members, invitations and tenant docs are function-only; `canAssignRole` forbids self-changes and assigning ≥ own rank | `rules.test.ts`, `functions.test.ts` “admins cannot escalate privileges” |
| Removed member keeps access | `status` checked by rules and functions on every request (and inside transactions) | both suites |
| Viewer/member performing restricted actions | Central permission table compiled into rules; functions check permissions | “role-based access”, “roles” |
| Forged amounts, balances, statuses | Finance collections are `write: false`; functions recompute; Zod strips unknown fields | “no one can write finance records directly”, “rejects forged and malformed amounts” |
| Duplicate / concurrent submissions | Idempotency key + transactions + version checks | ledger integrity tests |
| Malformed documents | Rules generated from Zod: exact key set, types, sizes, enums, date patterns, server timestamps, `createdBy == uid` | “document validation” |
| Invitation hijacking | Accept requires a **verified** email equal to the invitation's | “only the verified invitee can accept” |
| Client portal data leak | 256-bit random tokens, stored only as SHA-256 hashes, expiring and revocable; server returns an allow-listed set of fields for one client | portal test |
| Stored XSS | No `dangerouslySetInnerHTML` anywhere; notes rendered by `SafeMarkdown` as text nodes; links limited to http(s) with `rel=noopener`; strict CSP | `SafeMarkdown.test.tsx`, e2e injection check |
| CSV injection in exports | Cells starting with `= + - @` are prefixed | code (`reports.tsx`) |
| Plaintext passwords (legacy) | Vault encrypted client-side (PBKDF2-SHA256 600k → AES-GCM-256, non-extractable key, auto-lock); server stores ciphertext only (rules enforce shape); legacy plaintext migrated then deleted; migration never copies secrets | `crypto.test.ts`, migration test |
| Malicious uploads | Type checked by extension **and** magic bytes, 25 MB limit, fixed storage names (`source.pdf`), storage rules restrict path, size and content type, private (no public URLs) | storage rules tests |
| Information leakage in errors | User-safe messages only; stacks logged server-side | code (`wrap`, `toUserError`) |
| Account enumeration on password reset | Same response whether or not the account exists | code |
| Clickjacking / sniffing / referrer leaks | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS (firebase.json) | config |

## Secrets and configuration

* The Firebase web config (`VITE_FIREBASE_*`) identifies the project and is public by design;
  it is supplied via environment variables, not hard-coded.
* No service-account credentials exist in the repository; functions use their runtime identity.
* `.env*` files are git-ignored except `.env.example`.

## Operational recommendations (configure in the Firebase/Google Cloud console)

1. **Deploy the new rules** — until then the legacy database remains effectively public
   (audit S1/S2). See DEPLOYMENT.md for the cut-over order.
2. Enable **App Check** (reCAPTCHA Enterprise) and set `ENFORCE_APP_CHECK=true` for functions;
   set `VITE_APPCHECK_SITE_KEY` for the web app. This rate-limits abuse of the public portal
   callables.
3. Enable **email enumeration protection** and keep Firebase Auth's built-in brute-force
   throttling on.
4. Restrict the browser API key to the hosting domains.
5. Rotate the legacy client-portal phone tokens: they are no longer used, but the legacy
   `clients.accessToken` values should be deleted once migration is complete.
6. Enable Firestore point-in-time recovery and scheduled exports (backups).
