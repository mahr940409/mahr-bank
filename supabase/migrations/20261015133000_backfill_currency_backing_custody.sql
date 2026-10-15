-- Move the existing currency issuance reserves into the separate MAHR custody view.
INSERT INTO public.national_bank_custody_accounts
  (national_bank_id, custody_type, currency_iso, amount, frozen)
SELECT
  nb.id,
  'currency_backing',
  'PDH',
  GREATEST(0, COALESCE(c.pdh_reserves, 0)),
  0
FROM public.national_banks nb
JOIN public.countries co ON co.id = nb.country_id
JOIN public.currencies c ON c.id = co.currency_id
WHERE COALESCE(c.pdh_reserves, 0) > 0
ON CONFLICT (national_bank_id, custody_type, currency_iso)
DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();
