# ProfJero Workspace — Audit of the Legacy Application

Audited codebase: `ProfJero WS/` (≈38k lines of vanilla JS/HTML, Firebase v10 via CDN).
The legacy app is kept in the repository unchanged as a reference and as the source
of the data migration (see `docs/MIGRATION.md`). It should be retired from hosting once
the migration is complete.

## 1. What exists

| Area | Legacy implementation |
|---|---|
| Hosting / shell | `index.html` single page with a hash router that dynamically imports `js/pages/*.js`; Tailwind via CDN (runtime JIT in production); Font Awesome CDN; PWA service worker. |
| Backend | Firebase only: Auth (email/password + Google), Firestore, Storage. **No Cloud Functions, no security rules in the repo.** |
| Data | ~60 **flat top-level collections** (`tasks`, `transactions`, `invoices`, `debts`, `passwords`, …). Ownership is a `userId` field set by the browser. |
| Modules | Dashboard, Tasks, Projects, Goals, Notes, Finance (incl. invoices, budgets, debts, subscriptions, bills, “AI” coach), Learning, Audiobook/Study Companion, Calendar, Clients, Client Portal, Health Coach, Identity (CV builder), Password Manager, Profile, Settings. |
| Tenancy | None. One user = one implicit workspace. |
| Roles | None. |
| Tests | None. |

## 2. Findings

Severity: **C** Critical · **H** High · **M** Medium · **L** Low.

### Security / Authorization / Multi-tenancy

| # | Sev | Finding | Evidence |
|---|---|---|---|
| S1 | C | No Firestore security rules are versioned. The client-portal code only works if rules allow **unauthenticated reads of `clients` and `invoices`** — i.e. the database is effectively public. | `client-portal.js:80-130`, `:288`, `:688` |
| S2 | C | Client portal falls back to **reading every invoice in the database** (`getDocs(collection(db,'invoices'))`) and filtering in the browser — every customer of every user is exposed. | `client-portal.js:118` |
| S3 | C | Client portal “login” is phone-number lookup across all users' clients; anyone who knows/guesses a phone number gets a portal token. Tokens are generated with `Math.random()` and stored in plain text, and are written from an unauthenticated browser. | `client-portal.js:29,688-760` |
| S4 | C | Password manager stores **plaintext passwords**, payment cards and secure notes in Firestore. | `password-manager.js:538-550` |
| S5 | C | All authorization is a client-side `where('userId','==',uid)` filter. Nothing prevents a user from querying another user's documents or writing records with someone else's `userId`. (IDOR / broken access control.) | every page module |
| S6 | H | Stored XSS: notes are saved as raw `contenteditable` HTML and re-rendered with `innerHTML`; >300 `innerHTML` template interpolations, many without `escapeHtml` (e.g. `identity.js:772`); `showToast` injects its message as HTML. | `notes.js:523`, `helpers.js:22` |
| S7 | H | Payment status can be set by the client portal (unauthenticated) — “pending approval” records are created by anyone. | `client-portal.js:196-260` |
| S8 | H | Settings “API key” generated with `Math.random()` and stored in a user document; not used by any server, misleading. | `settings.js:847` |
| S9 | M | Firebase web config duplicated in `client-portal.html`; app check / rate limiting absent; Google popup only, no password recovery flow. | `client-portal.html:1238`, `login.html` |
| S10 | M | `login.html` placeholder pre-fills the owner's real e-mail address. | `login.html` |

### Financial correctness / data integrity

| # | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | C | Money stored and summed as JS floats (`parseFloat`, `reduce(s+t.amount)`). Rounding drift accumulates (0.1+0.2). | `finance.js` passim |
| F2 | C | `parseFloat('')` → `NaN` passes `amount > remaining` checks and is **written to Firestore**; negative amounts are accepted. | `finance.js:4276-4296`, `:3416` |
| F3 | C | Payments are read-modify-write from an in-memory cache (`debt.paidAmount + x`) followed by **3 separate non-atomic writes**. Two tabs/double-clicks ⇒ lost or double-counted repayments; a failure between writes leaves totals and history disagreeing. | `finance.js:4284-4306`, `:3427-3460` |
| F4 | C | No accounts and no transfers: “balance” is lifetime income − expenses; moving money between MoMo and bank cannot be represented correctly. Lending/borrowing never touches balances. | `finance.js:1846-1895` |
| F5 | H | Duplicate, divergent balance calculations: Dashboard (`dashboard.js:595`), Finance stats, cash-flow, health score and monthly review each compute totals separately. | |
| F6 | H | Month windows use `new Date(y, m+1, 0)` (= last day **00:00**) as an inclusive end, dropping almost all of the last day's transactions; dates mixed between `Timestamp`, `Date` and strings in browser local time. | `finance.js:880-884` |
| F7 | H | Financial-health score contains a hard-coded `billsScore = 100`, classifies all food spending as “impulse”, and treats `investment` as an *income* category. It is not explainable. | `finance.js:867-930` |
| F8 | H | “AI” financial advisor/health coach pick **random** canned messages (`Math.random()`), presenting them as intelligence. | `finance.js:1697`, `health-coach.js:489`, `goals.js:503` |
| F9 | M | Editing/deleting a transaction hard-deletes it with no audit trail or reversal. | `finance.js` delete handlers |
| F10 | M | `finance0.js` is a 5k-line near-duplicate of `finance.js` (dead code). | |

### Data model / reliability

| # | Sev | Finding |
|---|---|---|
| D1 | H | Tasks query uses `orderBy('dueDate')`; Firestore omits documents without that field, so **tasks without a due date silently disappear**. |
| D2 | H | Projects embed `tasks: []`, `notes: []`, `team: []` arrays inside the project document while tasks also live in `tasks` — two sources of truth; progress is both manual and computed (`projects.js:1209`). |
| D3 | M | Goals progress = `max(manual, milestones)` — conflicting values with no rule. |
| D4 | M | Inconsistent status vocabularies across modules (`todo/done`, `not-started/in-progress`, `pending/partially-paid`). |
| D5 | M | Denormalized names (`goalName`, `clientName`) copied into records with no sync strategy. |
| D6 | M | Client portal matches invoices by `clientName` string — collisions across users. |

### Architecture / maintainability / performance / UX

| # | Sev | Finding |
|---|---|---|
| A1 | H | Pages are 1–5k line files mixing data access, business logic, HTML strings and global `window.*App` handlers. |
| A2 | M | Tailwind CDN JIT in production, 3 CDN libraries loaded on every page (pdf.js, mammoth, jszip). |
| A3 | M | Every page re-fetches every collection on load (finance loads 11 collections); no pagination beyond in-memory slicing. |
| A4 | M | 307 `console.log/error` calls including emoji debug logs of client data. |
| A5 | M | Service worker caches icon files that do not exist (`icon-152`, `icon-384`) ⇒ `addAll` fails, offline shell never installs. |
| A6 | L | Branding inconsistent (“ProfJero OS”, “ProfJero WS”). |
| A7 | L | Study companion text cleaner applies line-anchored regexes without the `m` flag and collapses all whitespace, so page numbers are not removed and paragraph pauses are lost (`audiobook.js:849-855`). |

## 3. What is worth preserving

* Feature set and workflows: quick-add task/expense, invoice creation and client payment
  confirmation flow, debts lent/borrowed, budgets per category, savings goals, study-session
  tracking, document-to-audio reading, meeting notes (attendees/agenda/action items).
* Ghana-first defaults: GHS / pesewas, Mobile Money as a first-class account type.
* Branding assets (`resources/`, `icons/`).
* All existing user data — migrated non-destructively (`docs/MIGRATION.md`).

## 4. Decisions taken from this audit

1. Rebuild on **React + TypeScript + Vite**, keep **Firebase** (existing data and auth users live there).
2. All tenant data moves under `tenants/{tenantId}/…`; access is enforced by **security rules** that check a server-written membership document.
3. Membership, roles, invitations and **every finance mutation** go through **Cloud Functions** (Admin SDK, Firestore transactions, idempotency keys). Clients cannot write finance data directly.
4. Money is **integer minor units** end-to-end; one finance engine (`packages/shared`) is used by functions and UI.
5. Client portal is rebuilt around a server-issued, hashed, revocable token and a function that returns only that client's invoices.
6. Password manager: plaintext storage is discontinued. The new vault encrypts client-side (AES-GCM, key derived from a master password that never leaves the device). Legacy plaintext entries are migrated by the owner and then deleted.
7. Fake “AI” output is removed. Insights are deterministic rules that state *why* they are shown.

## 5. Resolution status

| Finding | Status |
|---|---|
| S1–S3, S5, S7 (open database, portal leaks, client-side authorization) | Fixed: tenant-scoped data, generated rules, function-only privileged writes, hashed portal tokens. **Takes effect when the new rules are deployed** (docs/DEPLOYMENT.md). |
| S4 plaintext passwords | Fixed: client-side encrypted vault + guided migration that deletes plaintext copies. |
| S6 XSS | Fixed: no HTML rendering of user content; CSP. |
| S8 fake API key | Removed. |
| S9, S10 | Fixed (config in env, password reset, no pre-filled email). App Check is supported but must be configured (docs/SECURITY.md). |
| F1–F10 | Fixed: integer money, validated input, transactional + idempotent writes, accounts & transfers, single engine, inclusive date ranges in workspace timezone, transparent score, deterministic insights, voiding instead of deletion. |
| D1–D6 | Fixed: undated tasks shown, single progress source, one status vocabulary per entity, ids instead of names. |
| A1–A7 | Fixed: modular TypeScript app, built CSS, lazy-loaded modules, live query cache, no debug logging, Study Companion text cleaning. |

## 6. Known limitations (not done in this rebuild)

* **Identity (CV builder) and Health Coach** were not rebuilt; their data is preserved in
  `legacyArchive`. Habits covers simple routine tracking.
* **Subscriptions / recurring bills** are not a separate feature; recurring expenses are
  detected from the ledger as insights.
* **No push/e-mail notifications** (task reminders, invitation e-mails). Invitations appear
  in-app for the invited, verified e-mail address.
* **Scanned PDFs** (images without text) cannot be read aloud — OCR is not included.
* **Currency conversion** between accounts in different currencies is not supported.
* **Large workspaces**: tasks, projects, goals and notes load whole per workspace (fine into
  the low thousands). Server-side pagination would be the next step for very large teams.
* **AI features** are deliberately not implemented; the deterministic insight/signal layer
  is the foundation (docs/ARCHITECTURE.md → Intelligence).
* The PWA service worker was not carried over; offline support comes from Firestore's
  persistent cache once the app has loaded.
