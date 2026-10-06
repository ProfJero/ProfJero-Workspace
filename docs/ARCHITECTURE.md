# Architecture

ProfJero Workspace is a multi-tenant productivity and finance workspace built on
**React + TypeScript (Vite)** and **Firebase** (Auth, Firestore, Cloud Functions,
Storage, Hosting).

## Repository layout

```
packages/shared/        Domain logic used by BOTH the server and the UI (no Firebase imports)
  src/money.ts            integer minor-unit money: parse / format / arithmetic
  src/dates.ts            calendar dates (YYYY-MM-DD) in the tenant timezone, periods
  src/permissions.ts      roles → permissions table (single source of authorization)
  src/schemas.ts          Zod schemas: stored documents + every function input
  src/collections.ts      which tenant collections exist and who may read/write them
  src/workspace.ts        task lifecycle, project/goal/course progress rules
  src/intelligence.ts     deterministic cross-module workspace signals
  src/studyText.ts        document text cleaning + speech chunking
  src/finance/*           ledger, reports, budgets, savings, debts, invoices,
                          health score, insights
  test/                   unit tests (vitest)
apps/functions/         Cloud Functions (callable). Every privileged / financial write.
  src/lib/core.ts         auth, membership check, input validation, idempotency, audit log, errors
  src/lib/ledger.ts       account loading + transactional balance updates
  src/tenants.ts          workspaces, invitations, roles, removal, ownership
  src/finance.ts          accounts, transactions, debts, budgets, savings, reconciliation
  src/invoices.ts         invoices, payments, client portal
  src/migration.ts        legacy data import
  test/                   emulator tests: rules, functions, migration
apps/web/               React app
  src/app/                auth, tenant context, shell/navigation, router
  src/lib/                Firebase init, live query cache, data writes, server actions, toasts
  src/ui/                 design system (primitives, overlays, money, safe markdown)
  src/features/*          one folder per module
firebase/               security rules (generated) + templates, Firestore indexes
scripts/build-rules.ts  generates rules from packages/shared
ProfJero WS/            the legacy app, kept read-only as the migration source
```

## Request flow

```
                     reads (live)                           writes
UI ──────────────► Firestore ◄── security rules ──┐   ┌── workspace docs (tasks, notes…):
  │                                                │   │   direct SDK write, validated by
  │                                                │   │   generated rules + same Zod schema
  │                                                │   │
  └── useAction(fn, requestId) ──► Cloud Function ─┘   └── finance, members, invoices:
                                   auth → validate → load membership → check permission
                                   → Firestore transaction (idempotency, reads, shared-engine
                                     validation, writes, audit log)
```

* **Reads** use Firestore listeners through a small shared cache (`lib/live.ts`): one
  listener per distinct query, kept for 30 s after the last subscriber so navigating is
  free. Firestore's persistent cache makes workspace data available offline.
* **Workspace writes** (tasks, projects, goals, milestones, notes, events, clients,
  learning, habits, custom categories) go directly to Firestore. They are validated in
  the browser and again by the rules, which are compiled from the same Zod schemas.
  They work offline and sync later.
* **Privileged writes** go through callable functions. Finance writes are never queued
  offline (`useAction` refuses to run offline so a payment cannot be replayed twice later).

## Multi-tenancy

```
User (Firebase Auth uid)
  └─ Membership  tenants/{tenantId}/members/{uid}  {role, status, invitedBy, joinedAt…}
       └─ Tenant  tenants/{tenantId}               {name, kind, currency, timezone, businessProfile}
            └─ Data  tenants/{tenantId}/{collection}/{id}
```

* A user can belong to many tenants; the active tenant is part of the URL (`/w/:tenantId/…`).
* All tenant data is physically under the tenant path. The rules grant access only if
  `tenants/{tenantId}/members/{request.auth.uid}` exists with `status == 'active'` and a role
  that has the needed permission. Membership documents are written **only** by functions.
* Functions load the caller's membership from the database for every call and re-check it
  inside the write transaction; `tenantId` in a request is treated as a claim to verify,
  never as authority.
* Removal sets `status: 'removed'`: access stops immediately (rules and functions both check it)
  while history is kept.

## Roles and permissions

Defined once in `packages/shared/src/permissions.ts`:

| Permission | Owner | Admin | Manager | Member | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| workspace.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| workspace.write | ✓ | ✓ | ✓ | ✓ | |
| workspace.deleteAny (others' records) | ✓ | ✓ | ✓ | | |
| clients.read | ✓ | ✓ | ✓ | ✓ | |
| clients.write | ✓ | ✓ | ✓ | | |
| finance.read / finance.write | ✓ | ✓ | ✓ | | |
| finance.manage (accounts, voiding debts/invoices, portal links, reconcile) | ✓ | ✓ | | | |
| members.manage | ✓ | ✓ | | | |
| tenant.update | ✓ | ✓ | | | |
| tenant.delete (ownership transfer, legacy import) | ✓ | | | | |
| audit.read | ✓ | ✓ | | | |

Role assignment rules (`canAssignRole`): nobody changes their own role; admins only assign
roles below admin and only to people below admin; ownership moves only by explicit transfer.
The UI uses the same functions to hide actions; the server enforces them independently.

## Data model (tenant collections)

| Collection | Written by | Key fields |
|---|---|---|
| tasks | client | title, status (todo/in_progress/blocked/done/cancelled), priority, dueDate, dueTime, projectId, goalId, assigneeId, labels, recurrence, completedOn |
| projects | client | name, status, priority, startDate, deadline, clientId, goalId, budgetMinor, progressMode (tasks/manual), manualProgress, archived |
| goals / milestones | client | outcome, category, status, targetDate, measureKind (milestones/numeric/tasks) |
| notes | client | title, body (plain text + safe markdown), category, tags, pinned, links{projectId,goalId,clientId,courseId,taskId}, meeting{…} |
| events | client | title, kind, allDay, start/end (wall time `YYYY-MM-DDTHH:mm` in tenant tz), links |
| clients / clientInteractions | client (clients.write) | profile, status, notes / kind, date, summary |
| courses / studySessions / documents | client | progress units / minutes / uploaded file + processed text |
| habits / habitLogs | client | target per day/week / one log per habit per day (`habitId_date`) |
| categories | client (finance.write) | custom finance categories |
| accounts, transactions, debts, budgets, savingsGoals, savingsContributions, invoices (+events), paymentNotices | **functions** | see docs/FINANCE.md |
| members, invitations, auditLogs, legacyArchive | **functions** | |
| requests, counters, migrations | functions, never readable | idempotency records, invoice numbering, import markers |

Every client-written document carries `createdBy/createdAt/updatedBy/updatedAt`; the rules
require `createdBy == auth.uid` and server timestamps, and forbid changing `createdBy`.

Relationships are ids within the same tenant. Display names are not copied onto
records except where history requires it (invoices freeze the client's details when sent).
Project and goal progress are **never stored** — they are computed from tasks/milestones by
`projectProgress` / `goalProgress`, unless the user explicitly chooses manual progress.

Users' private data lives under `users/{uid}`: profile and the end-to-end-encrypted vault.

## Interconnection

* Tasks link to projects, goals and assignees; calendar shows events plus task due dates,
  project deadlines and milestones; overlapping events are flagged.
* Projects show their tasks, notes, client, goal and (for finance roles) income, spending
  and budget from ledger entries tagged with the project.
* Goals aggregate milestones, linked tasks and tasks of linked projects.
* Clients show projects, notes, invoices, communication history and portal links.
* Learning links courses to goals; study sessions and the document reader feed the dashboard.
* The dashboard combines all of them with `workspaceSignals` and finance insights.

## Intelligence (AI-ready, no fake AI)

`financeInsights`, `financialHealth` and `workspaceSignals` are deterministic functions that
return facts with their reasons and evidence. A future AI service should consume these
(plus the documents' processed text) server-side — e.g. a function that summarises the
signals or generates study questions from `text.json` — and must cite the underlying
facts rather than invent new ones. No model calls exist in this codebase today.

## Error handling

* Functions throw `HttpsError` with a `reason` from `ERROR_REASONS` and a user-safe message;
  unexpected exceptions are logged with stack traces server-side and returned as a generic
  "Something went wrong" (`lib/core.ts → wrap`).
* The UI maps any error through `toUserError` — raw Firebase messages are never shown.
* A top-level error boundary and route error elements show a recoverable screen.

## Frontend dependencies (and why)

| Dependency | Why |
|---|---|
| react, react-dom, react-router | UI and routing |
| firebase | backend SDK |
| zod, react-hook-form, @hookform/resolvers | one schema language for forms, functions and rules |
| @radix-ui/react-dialog / dropdown-menu / tabs | accessible focus management and keyboard behaviour |
| tailwindcss | styling via design tokens |
| lucide-react | icons |
| clsx | class composition |
| pdfjs-dist | PDF text extraction (lazy-loaded on the Study Companion only) |

Not used on purpose: a server-state library (Firestore listeners already cache and update),
a chart library (two small SVG charts), a DOCX library (zip + `DecompressionStream`).
