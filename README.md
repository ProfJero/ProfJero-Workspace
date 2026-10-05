# ProfJero Workspace

A multi-tenant workspace for tasks, projects, goals, notes, calendar, clients, finance,
learning and habits — built so that **every balance is traceable, every action is
authorised on the server, and no workspace can see another's data.**

React + TypeScript (Vite) · Firebase Auth / Firestore / Cloud Functions / Storage.

## Modules

| Module | Highlights |
|---|---|
| Today (dashboard) | overdue & today's tasks, schedule, projects, goals, money snapshot, habits, study time, cross-module "needs attention" signals with reasons |
| Tasks | one lifecycle (to do → in progress/blocked → done/cancelled), priorities, recurrence, assignees, projects/goals; undated tasks are never hidden |
| Projects | progress from tasks (or explicit manual %), deadline health, client, goal, notes, budget vs spending |
| Goals | outcomes measured by milestones, a number, or linked tasks/projects |
| Notes | safe Markdown, meeting notes, links to projects/goals/clients/courses, works offline |
| Calendar | events + task due dates + deadlines + milestones; overlap detection; phone agenda |
| Clients | profile, history, projects, invoices, secure portal links |
| Finance | accounts (Cash/MoMo/Bank…), exact integer ledger, transfers, refunds, adjustments, budgets, savings goals, money lent/borrowed with partial repayments, invoices and client payment notices, reports, CSV export, transparent health score, explained insights, ledger reconciliation |
| Learning | courses, study sessions & streaks, **Study Companion**: upload PDF/DOCX/TXT, cleaned text, sentence-aware read-aloud with page ranges and resume |
| Habits | daily/weekly targets and streaks |
| Settings | workspace & business profile, members/invitations/roles, categories, audit log, legacy import |
| Password vault | end-to-end encrypted in the browser |

## Quick start

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # VITE_USE_EMULATORS=true, VITE_FIREBASE_PROJECT_ID=demo-profjero
npm run build -w @profjero/functions
npx firebase emulators:start --project demo-profjero   # see docs/DEPLOYMENT.md if behind a proxy
npm run dev
```

## Verify

```bash
npm run typecheck && npm test && npm run test:emulator && npm run build
```

* `npm test` — 90 unit tests: money, dates, ledger, reports, budgets, savings, debts, invoices,
  health score, insights, permissions, progress rules, study text, vault crypto, safe markdown.
* `npm run test:emulator` — 46 tests against the Firebase emulators: tenant isolation,
  RBAC and privilege escalation, document validation, storage rules, idempotency and
  concurrency of financial writes, debts, refunds, invoices and the client portal,
  reconciliation, and the legacy migration.

## Documentation

* [docs/AUDIT.md](docs/AUDIT.md) — audit of the previous app and what was fixed
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, tenancy, roles, data model, data flow
* [docs/FINANCE.md](docs/FINANCE.md) — money model, ledger rules, formulas, guarantees
* [docs/SECURITY.md](docs/SECURITY.md) — controls, tests, operational recommendations
* [docs/MIGRATION.md](docs/MIGRATION.md) — importing data from the previous app
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — environments, checks, production cut-over

The previous app is kept unchanged in `ProfJero WS/` as the migration source. It stops
working once the new security rules are deployed (by design — its database access was public).
