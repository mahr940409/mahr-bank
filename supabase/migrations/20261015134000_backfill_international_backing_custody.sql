-- Move existing international backing lines into the separated MAHR custody view.
INSERT INTO public.national_bank_custody_accounts
  (national_bank_id, custody_type, currency_iso, amount, frozen)
SELECT
  bb.bank_id,
  'international_backing',
  bb.currency_iso,
  GREATEST(0, COALESCE(bb.amount, 0)),
  LEAST(GREATEST(0, COALESCE(bb.frozen, 0)), GREATEST(0, COALESCE(bb.amount, 0)))
FROM public.bank_backings bb
WHERE bb.bank_type = 'national'
ON CONFLICT (national_bank_id, custody_type, currency_iso)
DO UPDATE SET
  amount = EXCLUDED.amount,
  frozen = EXCLUDED.frozen,
  updated_at = now();
