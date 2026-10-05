import type { Account, LedgerTransaction } from '../src';

let seq = 0;
export function tx(partial: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'type' | 'amountMinor'>): LedgerTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    status: 'posted',
    currency: 'GHS',
    date: '2026-03-15',
    accountId: 'momo',
    toAccountId: null,
    categoryId: partial.type === 'income' ? 'salary' : partial.type === 'expense' || partial.type === 'refund' ? 'groceries' : null,
    nature: null,
    adjustmentDirection: null,
    description: '',
    payee: null,
    reference: null,
    debtId: null,
    invoiceId: null,
    refundOfId: null,
    projectId: null,
    clientId: null,
    goalId: null,
    ...partial,
  };
}

export function account(id: string, opening = 0, partial: Partial<Account> = {}): Account {
  return { id, name: id, type: 'bank', currency: 'GHS', openingBalanceMinor: opening, balanceMinor: opening, archived: false, ...partial };
}
