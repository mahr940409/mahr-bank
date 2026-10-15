
CREATE TABLE public.private_banks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  country_id TEXT NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  national_bank_id TEXT NOT NULL REFERENCES public.national_banks(id) ON DELETE CASCADE,
  fee_withdrawal NUMERIC NOT NULL DEFAULT 0,
  fee_transfer NUMERIC NOT NULL DEFAULT 0,
  fee_deposit NUMERIC NOT NULL DEFAULT 0,
  pdh_reserve NUMERIC NOT NULL DEFAULT 0,
  kyd_reserve NUMERIC NOT NULL DEFAULT 0,
  guarantor_source_type TEXT NOT NULL DEFAULT 'mahr',
  guarantor_source_account_id TEXT,
  guarantor_frozen_kyd NUMERIC NOT NULL DEFAULT 0,
  guarantor_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_banks TO anon, authenticated;
GRANT ALL ON public.private_banks TO service_role;
ALTER TABLE public.private_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access private_banks" ON public.private_banks FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER private_banks_updated_at BEFORE UPDATE ON public.private_banks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.private_bank_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  private_bank_id TEXT NOT NULL REFERENCES public.private_banks(id) ON DELETE CASCADE,
  holder TEXT NOT NULL,
  account_number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'client',
  balance_real NUMERIC NOT NULL DEFAULT 0,
  balance_symbolic NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_bank_accounts TO anon, authenticated;
GRANT ALL ON public.private_bank_accounts TO service_role;
ALTER TABLE public.private_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access private_bank_accounts" ON public.private_bank_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER private_bank_accounts_updated_at BEFORE UPDATE ON public.private_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.private_bank_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  private_bank_id TEXT NOT NULL REFERENCES public.private_banks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  fee NUMERIC NOT NULL DEFAULT 0,
  money_source TEXT NOT NULL DEFAULT 'printed',
  currency_iso TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_bank_transactions TO anon, authenticated;
GRANT ALL ON public.private_bank_transactions TO service_role;
ALTER TABLE public.private_bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access private_bank_transactions" ON public.private_bank_transactions FOR ALL USING (true) WITH CHECK (true);
