import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BankSettings {
  depositCommission: number;
  businessTransferCommission: number;
  internationalTransferCommission: number;
  personalLoanInterestRate: number;
  businessLoanInterestRate: number;
  latePaymentPenaltyRate: number;
  cdtRate4w: number;
  cdtRate8w: number;
  cdtRate12w: number;
  cdtRate24w: number;
  savingsWeeklyInterestRate: number;
}

const DEFAULT_SETTINGS: BankSettings = {
  depositCommission: 0.08,
  businessTransferCommission: 0.05,
  internationalTransferCommission: 0.03,
  personalLoanInterestRate: 15.0,
  businessLoanInterestRate: 12.0,
  latePaymentPenaltyRate: 0.02,
  cdtRate4w: 0.04,
  cdtRate8w: 0.06,
  cdtRate12w: 0.08,
  cdtRate24w: 0.10,
  savingsWeeklyInterestRate: 0.005,
};

// Global cache so all consumers share the same settings
let settingsCache: BankSettings = { ...DEFAULT_SETTINGS };

export function getBankSettings(): BankSettings {
  return settingsCache;
}

export function getCDTRates(): Record<number, number> {
  const s = settingsCache;
  return {
    4: s.cdtRate4w,
    8: s.cdtRate8w,
    12: s.cdtRate12w,
    24: s.cdtRate24w,
  };
}

export function useBankSettings() {
  const [settings, setSettings] = useState<BankSettings>(settingsCache);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('bank_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    if (!error && data) {
      const row = data as any;
      const loaded: BankSettings = {
        depositCommission: Number(row.deposit_commission),
        businessTransferCommission: Number(row.business_transfer_commission),
        internationalTransferCommission: Number(row.international_transfer_commission),
        personalLoanInterestRate: Number(row.personal_loan_interest_rate),
        businessLoanInterestRate: Number(row.business_loan_interest_rate),
        latePaymentPenaltyRate: Number(row.late_payment_penalty_rate),
        cdtRate4w: Number(row.cdt_rate_4w),
        cdtRate8w: Number(row.cdt_rate_8w),
        cdtRate12w: Number(row.cdt_rate_12w),
        cdtRate24w: Number(row.cdt_rate_24w),
        savingsWeeklyInterestRate: Number(row.savings_weekly_interest_rate),
      };
      settingsCache = loaded;
      setSettings(loaded);
    }
    setLoading(false);
  };

  const updateSettings = async (newSettings: Partial<BankSettings>) => {
    const updateObj: Record<string, number> = {};
    if (newSettings.depositCommission !== undefined) updateObj.deposit_commission = newSettings.depositCommission;
    if (newSettings.businessTransferCommission !== undefined) updateObj.business_transfer_commission = newSettings.businessTransferCommission;
    if (newSettings.internationalTransferCommission !== undefined) updateObj.international_transfer_commission = newSettings.internationalTransferCommission;
    if (newSettings.personalLoanInterestRate !== undefined) updateObj.personal_loan_interest_rate = newSettings.personalLoanInterestRate;
    if (newSettings.businessLoanInterestRate !== undefined) updateObj.business_loan_interest_rate = newSettings.businessLoanInterestRate;
    if (newSettings.latePaymentPenaltyRate !== undefined) updateObj.late_payment_penalty_rate = newSettings.latePaymentPenaltyRate;
    if (newSettings.cdtRate4w !== undefined) updateObj.cdt_rate_4w = newSettings.cdtRate4w;
    if (newSettings.cdtRate8w !== undefined) updateObj.cdt_rate_8w = newSettings.cdtRate8w;
    if (newSettings.cdtRate12w !== undefined) updateObj.cdt_rate_12w = newSettings.cdtRate12w;
    if (newSettings.cdtRate24w !== undefined) updateObj.cdt_rate_24w = newSettings.cdtRate24w;
    if (newSettings.savingsWeeklyInterestRate !== undefined) updateObj.savings_weekly_interest_rate = newSettings.savingsWeeklyInterestRate;

    const { error } = await supabase
      .from('bank_settings')
      .update(updateObj as any)
      .eq('id', 'default');

    if (!error) {
      await loadSettings();
    }
    return !error;
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return { settings, loading, updateSettings, reload: loadSettings };
}
