import type { SpendingNature } from './types';

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  /** Default nature suggested when recording an expense in this category; the user can override per entry. */
  defaultNature: SpendingNature | null;
  system: boolean;
}

/**
 * Built-in categories. IDs are stable and stored on transactions; names are
 * display-only. Tenants can add custom categories (tenants/{t}/categories).
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Salary & wages', kind: 'income', defaultNature: null, system: true },
  { id: 'business_income', name: 'Business income', kind: 'income', defaultNature: null, system: true },
  { id: 'client_payment', name: 'Client payments', kind: 'income', defaultNature: null, system: true },
  { id: 'freelance', name: 'Freelance', kind: 'income', defaultNature: null, system: true },
  { id: 'investment_income', name: 'Investment returns', kind: 'income', defaultNature: null, system: true },
  { id: 'gifts_received', name: 'Gifts received', kind: 'income', defaultNature: null, system: true },
  { id: 'other_income', name: 'Other income', kind: 'income', defaultNature: null, system: true },

  { id: 'housing', name: 'Rent & housing', kind: 'expense', defaultNature: 'need', system: true },
  { id: 'utilities', name: 'Utilities', kind: 'expense', defaultNature: 'need', system: true },
  { id: 'groceries', name: 'Groceries', kind: 'expense', defaultNature: 'need', system: true },
  { id: 'eating_out', name: 'Eating out', kind: 'expense', defaultNature: 'want', system: true },
  { id: 'transport', name: 'Transport & fuel', kind: 'expense', defaultNature: 'need', system: true },
  { id: 'airtime_data', name: 'Airtime & data', kind: 'expense', defaultNature: 'need', system: true },
  { id: 'health', name: 'Health', kind: 'expense', defaultNature: 'need', system: true },
  { id: 'education', name: 'Education', kind: 'expense', defaultNature: 'investment', system: true },
  { id: 'family_support', name: 'Family support', kind: 'expense', defaultNature: 'obligation', system: true },
  { id: 'giving', name: 'Tithes & giving', kind: 'expense', defaultNature: 'obligation', system: true },
  { id: 'insurance', name: 'Insurance', kind: 'expense', defaultNature: 'obligation', system: true },
  { id: 'loan_interest', name: 'Loan interest & fees', kind: 'expense', defaultNature: 'obligation', system: true },
  { id: 'subscriptions', name: 'Subscriptions', kind: 'expense', defaultNature: 'want', system: true },
  { id: 'shopping', name: 'Shopping', kind: 'expense', defaultNature: 'want', system: true },
  { id: 'entertainment', name: 'Entertainment', kind: 'expense', defaultNature: 'want', system: true },
  { id: 'personal_care', name: 'Personal care', kind: 'expense', defaultNature: 'want', system: true },
  { id: 'business_expense', name: 'Business expenses', kind: 'expense', defaultNature: 'obligation', system: true },
  { id: 'investments', name: 'Investments', kind: 'expense', defaultNature: 'investment', system: true },
  { id: 'taxes', name: 'Taxes & fees', kind: 'expense', defaultNature: 'obligation', system: true },
  { id: 'other_expense', name: 'Other expenses', kind: 'expense', defaultNature: 'other', system: true },
];

export function categoryMap(custom: Category[] = []): Map<string, Category> {
  return new Map([...DEFAULT_CATEGORIES, ...custom].map((c) => [c.id, c]));
}

export function categoryName(id: string | null, categories: Map<string, Category>): string {
  if (!id) return 'Uncategorised';
  return categories.get(id)?.name ?? 'Unknown category';
}
