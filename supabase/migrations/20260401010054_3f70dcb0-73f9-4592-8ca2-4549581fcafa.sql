
ALTER TABLE public.bank_settings
  ADD COLUMN cdt_rate_4w numeric NOT NULL DEFAULT 0.04,
  ADD COLUMN cdt_rate_8w numeric NOT NULL DEFAULT 0.06,
  ADD COLUMN cdt_rate_12w numeric NOT NULL DEFAULT 0.08,
  ADD COLUMN cdt_rate_24w numeric NOT NULL DEFAULT 0.10;

ALTER TABLE public.cdts
  ADD COLUMN interest_payout_frequency text NOT NULL DEFAULT 'at_maturity',
  ADD COLUMN is_indefinite boolean NOT NULL DEFAULT false;
