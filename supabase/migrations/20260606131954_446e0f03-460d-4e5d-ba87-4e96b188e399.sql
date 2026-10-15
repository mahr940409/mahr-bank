
ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS pdh_reserves numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS printed_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS burned_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_units_per_pdh numeric NOT NULL DEFAULT 1;
