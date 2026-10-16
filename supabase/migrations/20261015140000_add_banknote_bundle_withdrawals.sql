-- Physical cash withdrawals are tracked in bundles of 16 notes.
ALTER TABLE public.banknote_denominations
  ADD COLUMN IF NOT EXISTS bundles_withdrawn integer NOT NULL DEFAULT 0;

ALTER TABLE public.banknote_denominations
  ADD CONSTRAINT banknote_denominations_bundles_withdrawn_nonnegative
  CHECK (bundles_withdrawn >= 0);
