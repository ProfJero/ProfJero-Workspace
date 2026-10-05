# Finance: model, rules and guarantees

All finance logic lives in `packages/shared/src/finance/` and is used unchanged by the
Cloud Functions (to validate and apply writes) and by the UI (to display). There is one
definition of every number.

## Money

* Amounts are **integer minor units** (`10050` = GH₵100.50) everywhere: storage, functions,
  calculations. Field names end in `Minor`.
* The only conversions are at the edges: `parseMoney` (user text → minor; rejects empty,
  malformed, negative, too many decimals — it never rounds silently) and `formatMoney`.
* Rates and fractional quantities use integer scaled values: tax in **basis points**
  (15% = 1500), quantities in **thousandths** (1.5 h = 1500), multiplied with BigInt and
  rounded half away from zero.
* Percentages come from `percentOf`, which returns `null` (never NaN/Infinity) when the
  base is zero.

## Dates

Financial dates are calendar dates `YYYY-MM-DD` in the **workspace timezone**. Periods
are inclusive on both ends (`2026-02-01 … 2026-02-28`), handle leap years, and never
depend on the browser's clock or UTC offset.

## Accounts and the ledger

An **account** (Cash, Bank, Mobile Money, Savings, Business, Credit, Other) has an opening
balance. Every money movement is a **ledger entry** (`transactions` collection):

| Type | Effect on accounts | Counts as |
|---|---|---|
| income | account + amount | income |
| expense | account − amount | spending (with category and need/want/investment/obligation) |
| refund | account + amount | reduces spending in its category; capped at the original expense |
| transfer | from − amount, to + amount | nothing — net position unchanged |
| adjustment | account ± amount | neither (balance corrections) |
| loan_disbursement | account − amount | money lent — not spending |
| loan_receipt | account + amount | money borrowed — not income |
| repayment_received / repayment_made | account ± amount | not income/spending |

`accountEffects()` is the single definition of these effects. Loan entries may have no
account (money that didn't pass through a tracked account).

**Balance** = opening balance + Σ effects of posted entries. Each account stores
`balanceMinor` as a cache, updated **in the same Firestore transaction** as the entry that
changes it. `reconcileAccounts` recomputes every balance from the ledger and reports (and
can correct) any drift; the test suite asserts zero drift after every scenario.

**Net position** = Σ account balances + money owed to you − money you owe.

## Reports (`reports.ts`)

For posted entries in an inclusive date range and one currency:

* income = Σ income
* spending = Σ expenses − Σ refunds
* net income (kept) = income − spending; savings rate = net income ÷ income (null if no income)
* adjustments, transfers and loan flows are reported separately
* cash flow = Σ all account effects = change in total balances (tested to be equal)

Dashboard, Finance overview, Reports, budgets, insights and the health score all call these.

## Integrity guarantees (and how they are enforced)

| Risk | Guarantee |
|---|---|
| Float rounding | integers only; inputs with more decimals than the currency are rejected |
| Forged amounts/balances | clients cannot write finance collections (rules: `write: false`); functions recompute everything server-side and ignore unknown fields |
| Duplicate submission / double click / refresh / retry | every call carries a `requestId`; the function stores the result under it **inside the same transaction**, so replays return the original result. The UI keeps the id until a success and blocks re-entrant submits |
| Concurrent edits (two tabs, two people) | Firestore transactions serialise writes to the same account/debt/invoice; edits carry `expectedVersion` and are rejected if the entry changed |
| Over-repayment / over-refund / over-withdrawal | checked against the current stored totals inside the transaction |
| Deletion | entries are **voided** (kept, with who/when/why) and their effects reversed — linked debts, invoices and refunds are updated in the same transaction |
| Offline | finance actions are refused while offline instead of being queued |
| Cross-tenant references | accounts/categories/links are loaded from the caller's tenant; foreign ids are "not found" |

Emulator tests (`apps/functions/test/functions.test.ts`) cover: the GH₵500 MoMo→Bank
transfer, 5 identical concurrent submissions creating one entry, 8 concurrent entries on
one account, stale edits, refunds limits, the GH₵1,000 loan repaid 300 + 200 = 500
outstanding, 4 concurrent repayments that would exceed the debt, voiding repayments and
debts, savings transfers, invoices and payment notices, and reconciliation.

## Debts (money lent / borrowed)

`debts` store principal, direction, counterparty, due date and `paidMinor` (cache of posted
repayments, updated transactionally). Repayment entries reference the debt. Remaining =
principal − paid; status is derived (`outstanding`, `partially_paid`, `overdue`, `settled`,
`void`). Principal changes are done by voiding and re-recording, so history stays explainable.

## Budgets

Planned amount per category set, monthly (calendar month in the workspace timezone) or a
custom inclusive range, optionally limited to accounts. Actual = expenses − refunds in scope,
floored at zero. Status: `unused`, `on_track`, `warning` (≥ 80%), `at_limit`, `exceeded`.
A zero budget has no percentage (`null`) and is `exceeded` as soon as anything is spent.

## Savings goals

Target, optional target date and optional savings account. Contributions/withdrawals are
recorded transactionally; a deposit with a source account also records a real transfer into
the goal's account. Remaining = max(0, target − saved); overfunding is shown separately;
progress is capped at 100%. Required monthly saving and "behind schedule" (vs a straight
line from creation to target date) are computed.

## Invoices

Lines (quantity in thousandths × unit price), discount, tax in basis points; totals are
always recomputed by the server. Numbers are sequential per workspace (counter read in the
creating transaction). Lifecycle: draft → sent → partially paid → paid, or void (only with
no payments). Recording a payment creates an income entry (category *Client payments*)
linked to the invoice, client and project. The client portal can only submit *payment
notices*; a finance user approves (which records the payment) or rejects them.

## Financial health score (`health.ts`)

Six components over the last **three complete months**, each 0–100 with an explanation;
unavailable components are excluded and weights re-normalised; no score is shown without
income data.

| Component | Weight | 100 points | 0 points |
|---|---|---|---|
| Savings rate | 25 | keeps ≥ 20% of income | spends ≥ income |
| Emergency reserve | 20 | liquid balances ≥ 6 months of spending | none |
| Debt burden | 20 | no borrowing outstanding | owes ≥ 3× monthly income |
| Overdue obligations | 15 | nothing overdue | −35 per overdue borrowing |
| Budget adherence | 10 | all budgets kept last period | none kept |
| Discretionary spending | 10 | wants ≤ 30% of classified spending | ≥ 70% |

## Insights (`insights.ts`)

Deterministic rules, each with a reason and the numbers behind it: category spending up
≥ 30% vs the pro-rated 3-month average (after day 10), one category > 40% of spending,
an expense > 3× its category median (≥ 5 samples), 15+ purchases in a category in 30 days,
recurring expenses (same payee in 3 of 4 months within 10%), budget warnings/overruns,
spending above income this month, overdue/upcoming debts, savings goals behind schedule.

## Multiple currencies

Accounts have a currency; entries must match their account's currency and transfers require
the same currency. Reports are per currency (the workspace currency by default). Currency
conversion is intentionally not implemented.
