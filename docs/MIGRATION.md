# Migrating data from the previous app

The previous app stored each user's data in flat top-level collections filtered by a
`userId` field. The new app stores data per workspace under `tenants/{tenantId}/…`.

## How a user migrates

1. Sign in to the new app with the **same account** as before (email/password or Google).
2. A personal workspace is created on first sign-in.
3. Settings → **Import** (workspace owners only) → *Preview import* shows what will be
   imported and what will be skipped, without writing anything.
4. *Import now* copies the data. It can be run again safely.
5. Account menu → **Password vault**: create a master password, then *Encrypt and move* the
   old plaintext passwords, secure notes and cards. Their plaintext copies are deleted.

## Guarantees

* **Non-destructive**: legacy documents are only read (the migration test asserts this).
* **Idempotent**: imported documents use the id `legacy_<oldId>`; re-running overwrites the
  same documents. Finance is imported once (guarded by `tenants/{id}/migrations/legacyFinance`)
  so balances can never be applied twice.
* **Validated**: workspace documents pass the same schemas as the security rules; invalid
  records are skipped and listed in the report.
* **Scoped**: only the caller's own legacy records (`userId == uid`) are read.
* **Secrets never copied**: `passwords`, `secureNotes`, `paymentCards` are excluded.

## Mapping

| Legacy | New | Notes |
|---|---|---|
| tasks | tasks | status `done/completed → done`, `in-progress → in_progress`; due timestamp → date + time in workspace timezone; unknown priority → medium; recurring patterns kept |
| projects (+ embedded `tasks[]`) | projects + tasks | progress kept as **manual** progress; embedded tasks become real linked tasks; budget → minor units |
| goals (non-savings) / milestones | goals / milestones | legacy % progress kept as a numeric measure (or milestones if any) |
| goals with category `savings`, financialGoals | savingsGoals (+ opening contribution) | |
| notes | notes | HTML converted to plain text (tags and scripts removed); meeting data kept |
| calendarEvents | events | start/end converted to wall time in workspace timezone |
| clients / clientCommunications | clients / clientInteractions | phone-based portal tokens are **not** migrated |
| courses / studySessions | courses / studySessions | course % → 100 units |
| transactions | ledger entries in an **"Imported (previous app)"** account | amounts → minor units; NaN/negative/invalid skipped and reported; categories mapped; `need/want` → spending nature |
| debts + debtPayments | debts + repayment entries (no account) | stored running total beyond recorded payments becomes one "Imported repayments" entry; capped at principal |
| budgets | monthly budgets | when category and amount are recognisable |
| invoices | invoices (+ client created by name if needed) | totals **recomputed exactly**; differences from legacy float totals are reported; invoice counter continues after the highest imported number |
| identity, health*, certifications, learningResources, subscriptions, recurringBills, goalNotes, goalAnalytics, invoiceTimeline, paymentHistory, audioDocuments | `legacyArchive` (read-only, owners/admins) | kept verbatim until those modules exist |

Because the previous app had no accounts, imported income and expenses are placed in one
account whose balance equals imported income − expenses. After importing, record an
**adjustment** or **transfers** so your real accounts (Cash, MoMo, bank) match reality.

## After everyone has migrated

Deleting the legacy collections is a separate, deliberate step (export a backup first);
nothing in the new app depends on them.
