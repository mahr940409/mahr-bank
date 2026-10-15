import { Currency } from './bank';

export type InterestPayoutFrequency = 'daily' | 'weekly' | 'at_maturity';

export interface CDT {
  id: string;
  accountId: string;
  userId: string;
  amount: number;
  currency: Currency;
  interestRate: number;
  termWeeks: number;
  startDate: Date;
  maturityDate: Date;
  status: 'active' | 'matured' | 'cancelled' | 'liquidated';
  finalAmount: number;
  earlyWithdrawalPenalty: number;
  interestPayoutFrequency: InterestPayoutFrequency;
  isIndefinite: boolean;
  createdAt: Date;
}

// Default rates keyed by weeks (fallback if settings not loaded)
export const CDT_RATES: Record<number, number> = {
  4: 0.04,
  8: 0.06,
  12: 0.08,
  24: 0.10,
};

export function calculateCDTReturn(amount: number, annualRate: number, termWeeks: number): number {
  const weeklyRate = annualRate / 52;
  return amount * Math.pow(1 + weeklyRate, termWeeks);
}

export function calculatePeriodicInterest(amount: number, annualRate: number, frequency: InterestPayoutFrequency): number {
  if (frequency === 'daily') {
    return amount * (annualRate / 365);
  } else if (frequency === 'weekly') {
    return amount * (annualRate / 52);
  }
  return 0; // at_maturity doesn't pay periodically
}
