import { LoanPayment, Account } from '@/types/bank';
import { getBankSettings } from '@/hooks/useBankSettings';

// Get current interest rates (dynamic from settings)
export function getInterestRates() {
  const s = getBankSettings();
  return {
    personal: s.personalLoanInterestRate,
    business: s.businessLoanInterestRate,
  };
}

// Keep backward-compatible exports (now dynamic getters)
export const INTEREST_RATES = new Proxy({} as { personal: number; business: number }, {
  get(_, prop: string) {
    const rates = getInterestRates();
    return (rates as any)[prop];
  }
});

export const LATE_PAYMENT_PENALTY_RATE = new Proxy({ value: 0 }, {
  get(target, prop) {
    if (prop === Symbol.toPrimitive || prop === 'valueOf') {
      return () => getBankSettings().latePaymentPenaltyRate;
    }
    return getBankSettings().latePaymentPenaltyRate;
  }
}) as unknown as number;

// Calculate weekly payment using amortization formula
export function calculateWeeklyPayment(
  principal: number,
  annualRate: number,
  weeks: number
): number {
  if (annualRate === 0) {
    return principal / weeks;
  }
  
  const weeklyRate = annualRate / 52 / 100;
  const payment = 
    principal * 
    (weeklyRate * Math.pow(1 + weeklyRate, weeks)) / 
    (Math.pow(1 + weeklyRate, weeks) - 1);
  
  return Math.round(payment * 100) / 100;
}

export const calculateMonthlyPayment = calculateWeeklyPayment;

// Get interest rate by account type
export function getInterestRateByAccountType(accountType: 'personal' | 'business'): number {
  return getInterestRates()[accountType];
}

// Generate loan payment schedule (weekly)
export function generatePaymentSchedule(
  loanId: string,
  principal: number,
  annualRate: number,
  termWeeks: number,
  startDate: Date
): Omit<LoanPayment, 'id' | 'createdAt'>[] {
  const weeklyPayment = calculateWeeklyPayment(principal, annualRate, termWeeks);
  const weeklyRate = annualRate / 52 / 100;
  let remainingBalance = principal;
  const schedule: Omit<LoanPayment, 'id' | 'createdAt'>[] = [];
  
  for (let i = 1; i <= termWeeks; i++) {
    const interestPayment = remainingBalance * weeklyRate;
    const principalPayment = weeklyPayment - interestPayment;
    remainingBalance -= principalPayment;
    
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + (i * 7));
    
    schedule.push({
      loanId,
      paymentNumber: i,
      dueDate,
      amount: Math.round(weeklyPayment * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      interest: Math.round(interestPayment * 100) / 100,
      penalty: 0,
      status: 'pending',
    });
  }
  
  return schedule;
}

// Check if account qualifies for loan
export function checkLoanEligibility(
  account: Account,
  requestedAmount: number,
  termWeeks: number
): {
  eligible: boolean;
  reason?: string;
  maxAmount?: number;
} {
  if (termWeeks < 4) {
    return { eligible: false, reason: 'El plazo mínimo es de 4 semanas' };
  }
  
  if (termWeeks > 260) {
    return { eligible: false, reason: 'El plazo máximo es de 260 semanas' };
  }
  
  if (requestedAmount <= 0) {
    return { eligible: false, reason: 'El monto debe ser mayor a 0' };
  }
  
  return { eligible: true };
}

// Calculate penalty for overdue payment
export function calculateLatePenalty(
  payment: LoanPayment,
  currentDate: Date
): number {
  if (payment.status === 'paid' || !payment.dueDate) {
    return 0;
  }
  
  const dueDate = new Date(payment.dueDate);
  const daysDiff = Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff <= 0) {
    return 0;
  }
  
  const weeksOverdue = Math.ceil(daysDiff / 7);
  const penaltyRate = getBankSettings().latePaymentPenaltyRate;
  const penalty = payment.amount * penaltyRate * weeksOverdue;
  
  return Math.round(penalty * 100) / 100;
}
