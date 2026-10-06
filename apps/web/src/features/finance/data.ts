import { useMemo } from 'react';
import { orderBy, where } from 'firebase/firestore';
import {
  addMonths,
  startOfMonth,
  type Account,
  type Budget,
  type DateRange,
  type Debt,
  type LedgerTransaction,
  type SavingsContribution,
  type SavingsGoal,
} from '@profjero/shared';
import { useTenantCollection, type WithMeta } from '@/lib/data';
import { useTenant } from '@/app/tenant';

/** Stored ledger document: the domain entry plus server-maintained fields. */
type LedgerFields = LedgerTransaction & {
  version: number;
  refundedMinor: number;
  voidReason: string | null;
  paymentMethod?: string;
};
export type StoredTransaction = WithMeta<LedgerFields>;
export type StoredAccount = WithMeta<Account>;
export type StoredDebt = WithMeta<Debt> & { accountId: string | null; voidReason?: string };
export type StoredBudget = WithMeta<Budget>;
export type StoredSavingsGoal = WithMeta<SavingsGoal>;

function useFinanceTenant() {
  const { tenantId, can } = useTenant();
  return can('finance.read') ? tenantId : null;
}

export const useAccounts = () => useTenantCollection<Account>(useFinanceTenant(), 'accounts');
export const useDebts = () => useTenantCollection<Debt & { accountId: string | null }>(useFinanceTenant(), 'debts');
export const useBudgets = () => useTenantCollection<Budget>(useFinanceTenant(), 'budgets');
export const useSavingsGoals = () => useTenantCollection<SavingsGoal>(useFinanceTenant(), 'savingsGoals');

export function useSavingsContributions(goalId: string | null) {
  const tenantId = useFinanceTenant();
  return useTenantCollection<SavingsContribution>(goalId ? tenantId : null, 'savingsContributions', ['goal', goalId], goalId ? [where('goalId', '==', goalId), orderBy('date', 'desc')] : []);
}

/** Ledger entries with date in [start, end]. Both bounds are inclusive calendar dates. */
export function useLedger(range: DateRange) {
  const tenantId = useFinanceTenant();
  return useTenantCollection<LedgerFields>(tenantId, 'transactions', ['range', range.start, range.end], [
    where('date', '>=', range.start),
    where('date', '<=', range.end),
    orderBy('date', 'desc'),
  ]);
}

/**
 * The standard analysis window: the current month plus the 12 before it.
 * Overview, dashboard snapshot, insights and the health score all read this
 * one shared live query.
 */
export function useAnalysisWindow(): DateRange {
  const { today } = useTenant();
  return useMemo(() => ({ start: addMonths(startOfMonth(today), -12), end: '2200-12-31' }), [today]);
}

export function useAnalysisLedger() {
  return useLedger(useAnalysisWindow());
}

export function accountName(accounts: StoredAccount[] | undefined, id: string | null): string {
  if (!id) return 'Not tracked in an account';
  return accounts?.find((a) => a.id === id)?.name ?? 'Deleted account';
}
