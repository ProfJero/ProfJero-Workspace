import type { CurrencyCode } from '../money';
import type { IsoDate } from '../dates';

export const ACCOUNT_TYPES = ['cash', 'bank', 'mobile_money', 'savings', 'business', 'credit', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank account',
  mobile_money: 'Mobile Money',
  savings: 'Savings',
  business: 'Business account',
  credit: 'Credit / overdraft',
  other: 'Other',
};

/** Account types counted as readily available money (emergency reserve). */
export const LIQUID_ACCOUNT_TYPES: readonly AccountType[] = ['cash', 'bank', 'mobile_money', 'savings', 'business'];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  /** Balance before the first ledger entry recorded in ProfJero. */
  openingBalanceMinor: number;
  /**
   * Denormalized cache of openingBalance + Σ ledger effects. Maintained only by
   * Cloud Functions inside the same Firestore transaction as the ledger write.
   * The ledger is the source of truth; see reconcileAccount().
   */
  balanceMinor: number;
  archived: boolean;
}

/**
 * Ledger entry types and their effect on accounts:
 *
 * income              accountId +amount            counts as income
 * expense             accountId −amount            counts as spending
 * refund              accountId +amount            reduces spending in its category
 * transfer            accountId −amount, toAccountId +amount   net position unchanged
 * adjustment          accountId ±amount (adjustmentDirection)   excluded from income/spending
 * loan_disbursement   accountId −amount  (I lent money; receivable +amount)
 * loan_receipt        accountId +amount  (I borrowed money; payable +amount)
 * repayment_received  accountId +amount  (receivable −amount)
 * repayment_made      accountId −amount  (payable −amount)
 *
 * Loan entries never count as income or spending — lending money is not an
 * expense and borrowing is not income. accountId may be null for loan entries
 * only (money that did not pass through a tracked account).
 */
export const TRANSACTION_TYPES = [
  'income',
  'expense',
  'refund',
  'transfer',
  'adjustment',
  'loan_disbursement',
  'loan_receipt',
  'repayment_received',
  'repayment_made',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  refund: 'Refund',
  transfer: 'Transfer',
  adjustment: 'Balance adjustment',
  loan_disbursement: 'Money lent',
  loan_receipt: 'Money borrowed',
  repayment_received: 'Repayment received',
  repayment_made: 'Repayment made',
};

export const LOAN_TYPES: readonly TransactionType[] = [
  'loan_disbursement',
  'loan_receipt',
  'repayment_received',
  'repayment_made',
];

/** Types a user records directly from the transaction form. Loan entries are created through Debts. */
export const USER_TRANSACTION_TYPES = ['income', 'expense', 'refund', 'transfer', 'adjustment'] as const;
export type UserTransactionType = (typeof USER_TRANSACTION_TYPES)[number];

export const SPENDING_NATURES = ['need', 'want', 'investment', 'obligation', 'other'] as const;
export type SpendingNature = (typeof SPENDING_NATURES)[number];

export const SPENDING_NATURE_LABELS: Record<SpendingNature, string> = {
  need: 'Need (essential)',
  want: 'Want (discretionary)',
  investment: 'Investment',
  obligation: 'Obligation (fixed commitment)',
  other: 'Other',
};

export type TransactionStatus = 'posted' | 'void';

export interface LedgerTransaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amountMinor: number;
  currency: CurrencyCode;
  date: IsoDate;
  accountId: string | null;
  /** Destination account (transfers only). */
  toAccountId: string | null;
  categoryId: string | null;
  nature: SpendingNature | null;
  adjustmentDirection: 'increase' | 'decrease' | null;
  description: string;
  payee: string | null;
  reference: string | null;
  debtId: string | null;
  invoiceId: string | null;
  refundOfId: string | null;
  projectId: string | null;
  clientId: string | null;
  goalId: string | null;
}

export type DebtDirection = 'lent' | 'borrowed';

export interface Debt {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  principalMinor: number;
  currency: CurrencyCode;
  date: IsoDate;
  dueDate: IsoDate | null;
  /** Denormalized Σ posted repayments; maintained transactionally by functions. */
  paidMinor: number;
  status: 'open' | 'settled' | 'void';
  notes: string;
}

export interface Budget {
  id: string;
  name: string;
  categoryIds: string[];
  period: { kind: 'monthly' } | { kind: 'custom'; start: IsoDate; end: IsoDate };
  amountMinor: number;
  currency: CurrencyCode;
  /** Optional restriction to particular accounts; empty = all accounts. */
  accountIds: string[];
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetMinor: number;
  currency: CurrencyCode;
  targetDate: IsoDate | null;
  /** Denormalized Σ contributions − withdrawals; maintained transactionally by functions. */
  savedMinor: number;
  accountId: string | null;
  status: 'active' | 'achieved' | 'archived';
  createdDate: IsoDate;
}

export interface SavingsContribution {
  id: string;
  goalId: string;
  kind: 'deposit' | 'withdrawal';
  amountMinor: number;
  date: IsoDate;
  note: string;
  transactionId: string | null;
}
