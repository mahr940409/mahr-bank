ALTER TABLE public.private_bank_accounts
  ADD COLUMN IF NOT EXISTS symbolic_backing_currency text;
