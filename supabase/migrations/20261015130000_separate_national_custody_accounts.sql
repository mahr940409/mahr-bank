-- Separate the National Bank's own resources from the two funds held by MAHR Bank.
CREATE TABLE IF NOT EXISTS public.national_bank_custody_accounts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  national_bank_id text NOT NULL,
  custody_type text NOT NULL CHECK (custody_type IN ('own_resources', 'currency_backing', 'international_backing')),
  currency_iso text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  frozen numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (national_bank_id, custody_type, currency_iso),
  CHECK (amount >= 0),
  CHECK (frozen >= 0),
  CHECK (frozen <= amount)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.national_bank_custody_accounts TO anon, authenticated;
ALTER TABLE public.national_bank_custody_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on national_bank_custody_accounts"
  ON public.national_bank_custody_accounts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS national_bank_custody_accounts_bank_idx
  ON public.national_bank_custody_accounts (national_bank_id, custody_type);
