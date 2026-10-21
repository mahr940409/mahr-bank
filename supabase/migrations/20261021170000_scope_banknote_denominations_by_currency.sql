ALTER TABLE public.banknote_denominations
  ADD COLUMN IF NOT EXISTS currency_iso text;

UPDATE public.banknote_denominations d
SET currency_iso = c.iso_symbol
FROM public.national_banks nb
JOIN public.countries co ON co.id = nb.country_id
JOIN public.currencies c ON c.id = co.currency_id
WHERE d.national_bank_id = nb.id
  AND d.currency_iso IS NULL;

ALTER TABLE public.banknote_denominations
  ALTER COLUMN currency_iso SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_banknote_denominations_currency
  ON public.banknote_denominations(national_bank_id, currency_iso);
