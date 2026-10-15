
-- =====================================================
-- BANCO NACIONAL: tables + RLS + grants
-- =====================================================

-- 1. national_banks: one per country
CREATE TABLE public.national_banks (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  country_id text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  pdh_reserve numeric NOT NULL DEFAULT 0,
  kyd_reserve numeric NOT NULL DEFAULT 0,
  frozen_pdh numeric NOT NULL DEFAULT 0,
  frozen_kyd numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.national_banks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.national_banks TO authenticated;
GRANT ALL ON public.national_banks TO service_role;

ALTER TABLE public.national_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on national_banks"
  ON public.national_banks FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_national_banks_updated_at
  BEFORE UPDATE ON public.national_banks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. national_bank_accounts: internal accounts of each national bank
CREATE TABLE public.national_bank_accounts (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  national_bank_id text NOT NULL,
  account_number text NOT NULL,
  holder_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'personal',
  balance_real numeric NOT NULL DEFAULT 0,
  balance_symbolic numeric NOT NULL DEFAULT 0,
  backing_currency text,
  backing_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.national_bank_accounts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.national_bank_accounts TO authenticated;
GRANT ALL ON public.national_bank_accounts TO service_role;

ALTER TABLE public.national_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on national_bank_accounts"
  ON public.national_bank_accounts FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_national_bank_accounts_updated_at
  BEFORE UPDATE ON public.national_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_national_bank_accounts_bank ON public.national_bank_accounts(national_bank_id);

-- 3. national_bank_transactions: unified ledger
CREATE TABLE public.national_bank_transactions (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  national_bank_id text NOT NULL,
  transaction_type text NOT NULL,
  from_account_id text,
  to_account_id text,
  counterparty_national_bank_id text,
  amount_local numeric NOT NULL DEFAULT 0,
  currency_local text,
  backing_amount numeric NOT NULL DEFAULT 0,
  backing_currency text,
  is_symbolic boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'executed',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.national_bank_transactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.national_bank_transactions TO authenticated;
GRANT ALL ON public.national_bank_transactions TO service_role;

ALTER TABLE public.national_bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on national_bank_transactions"
  ON public.national_bank_transactions FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_nbtx_bank ON public.national_bank_transactions(national_bank_id, created_at DESC);
