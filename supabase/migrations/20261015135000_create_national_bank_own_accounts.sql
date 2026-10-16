-- Create the operational treasury account for national banks created before this feature.
INSERT INTO public.national_bank_accounts
  (national_bank_id, account_number, holder_name, account_type, balance_real, balance_symbolic, status)
SELECT
  nb.id,
  'NB-OWN-' || floor(random() * 9000000 + 1000000)::text,
  nb.name || ' · Cuenta propia',
  'bank_treasury',
  0,
  0,
  'active'
FROM public.national_banks nb
WHERE NOT EXISTS (
  SELECT 1 FROM public.national_bank_accounts a
  WHERE a.national_bank_id = nb.id AND a.account_type = 'bank_treasury'
);

-- The treasury account starts with the issuer's available printed money.
UPDATE public.national_bank_accounts treasury
SET balance_real = GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(withdrawn.total_withdrawn, 0))
FROM public.national_banks nb
JOIN public.countries co ON co.id = nb.country_id
JOIN public.currencies c ON c.id = co.currency_id
LEFT JOIN (
  SELECT national_bank_id, SUM(COALESCE(value, 0) * 16 * COALESCE(bundles_withdrawn, 0)) AS total_withdrawn
  FROM public.banknote_denominations
  GROUP BY national_bank_id
) withdrawn ON withdrawn.national_bank_id = nb.id
WHERE treasury.national_bank_id = nb.id
  AND treasury.account_type = 'bank_treasury';
