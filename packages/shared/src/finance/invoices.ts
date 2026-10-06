import { applyBasisPoints, multiplyByQuantity, sumMinor } from '../money';
import type { IsoDate } from '../dates';

export interface InvoiceLine {
  description: string;
  /** Quantity in thousandths (1.5 hours = 1500) so fractional quantities stay exact. */
  quantityMilli: number;
  unitPriceMinor: number;
}

export interface InvoiceTotals {
  lineTotalsMinor: number[];
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * subtotal = Σ round(qty × unitPrice)
 * taxable  = subtotal − discount       (discount cannot exceed subtotal)
 * tax      = round(taxable × taxRate)  (taxRate in basis points: 15% = 1500)
 * total    = taxable + tax
 */
export function computeInvoiceTotals(lines: InvoiceLine[], discountMinor: number, taxRateBps: number): InvoiceTotals {
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0) throw new RangeError('Discount must be zero or positive.');
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) throw new RangeError('Tax rate must be 0–100%.');
  const lineTotalsMinor = lines.map((l) => {
    if (!Number.isSafeInteger(l.quantityMilli) || l.quantityMilli <= 0) throw new RangeError('Quantity must be positive.');
    if (!Number.isSafeInteger(l.unitPriceMinor) || l.unitPriceMinor < 0) throw new RangeError('Unit price cannot be negative.');
    return multiplyByQuantity(l.unitPriceMinor, l.quantityMilli);
  });
  const subtotalMinor = sumMinor(lineTotalsMinor);
  if (discountMinor > subtotalMinor) throw new RangeError('Discount cannot exceed the subtotal.');
  const taxableMinor = subtotalMinor - discountMinor;
  const taxMinor = applyBasisPoints(taxableMinor, taxRateBps);
  return { lineTotalsMinor, subtotalMinor, discountMinor, taxableMinor, taxMinor, totalMinor: taxableMinor + taxMinor };
}

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';

export function invoicePaymentStatus(
  current: InvoiceStatus,
  totalMinor: number,
  paidMinor: number,
): InvoiceStatus {
  if (current === 'void' || current === 'draft') return current;
  if (paidMinor >= totalMinor) return 'paid';
  if (paidMinor > 0) return 'partially_paid';
  return 'sent';
}

export function isInvoiceOverdue(inv: { status: InvoiceStatus; dueDate: IsoDate | null }, today: IsoDate): boolean {
  return (inv.status === 'sent' || inv.status === 'partially_paid') && !!inv.dueDate && today > inv.dueDate;
}

export function validateInvoicePayment(inv: { status: InvoiceStatus; totalMinor: number; paidMinor: number }, amountMinor: number): string | null {
  if (inv.status === 'void') return 'This invoice has been voided.';
  if (inv.status === 'draft') return 'Send the invoice before recording payments.';
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return 'Amount must be greater than zero.';
  const due = inv.totalMinor - inv.paidMinor;
  if (due <= 0) return 'This invoice is already paid.';
  if (amountMinor > due) return 'Payment is larger than the balance due.';
  return null;
}

export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(5, '0')}`;
}
