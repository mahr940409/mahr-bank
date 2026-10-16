ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS balance_real numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_symbolic numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_frozen numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS backing_currency text,
  ADD COLUMN IF NOT EXISTS backing_amount numeric NOT NULL DEFAULT 0;

-- Conserva los saldos existentes: antes todo estaba representado en balance_pdh.
UPDATE public.accounts
SET balance_real = COALESCE(balance_pdh, 0),
    balance_symbolic = 0,
    balance_frozen = 0,
    backing_amount = 0
WHERE balance_real = 0 AND balance_symbolic = 0 AND balance_frozen = 0;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_balance_real_nonnegative CHECK (balance_real >= 0),
  ADD CONSTRAINT accounts_balance_symbolic_nonnegative CHECK (balance_symbolic >= 0),
  ADD CONSTRAINT accounts_balance_frozen_nonnegative CHECK (balance_frozen >= 0),
  ADD CONSTRAINT accounts_backing_amount_nonnegative CHECK (backing_amount >= 0),
  ADD CONSTRAINT accounts_balance_frozen_lte_total CHECK (balance_frozen <= balance_real + balance_symbolic);
