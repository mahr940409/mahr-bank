-- One-time reconciliation: bank_main_account must represent the custody
-- recorded in MAHR, not an extra operational copy of the same backing.
DO $$
DECLARE
  v_international numeric := 0;
  v_defense numeric := 0;
  v_frozen_cheques numeric := 0;
  v_custody numeric := 0;
BEGIN
  SELECT COALESCE(SUM(bb.amount * CASE
    WHEN upper(bb.currency_iso) = 'PDH' THEN 1
    WHEN GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)) > 0
      THEN COALESCE(c.pdh_reserves, 0) / NULLIF(GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)), 0)
    ELSE COALESCE(c.exchange_rate_to_pdh, 0)
  END), 0)
  INTO v_international
  FROM public.bank_backings bb
  LEFT JOIN public.currencies c ON c.iso_symbol = upper(bb.currency_iso)
  WHERE bb.bank_type = 'national';

  SELECT COALESCE(SUM(rc.amount * CASE
    WHEN upper(rc.currency_iso) = 'PDH' THEN 1
    WHEN GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)) > 0
      THEN COALESCE(c.pdh_reserves, 0) / NULLIF(GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)), 0)
    ELSE COALESCE(c.exchange_rate_to_pdh, 0)
  END), 0)
  INTO v_defense
  FROM public.mahr_reserve_custody rc
  LEFT JOIN public.currencies c ON c.iso_symbol = upper(rc.currency_iso)
  WHERE rc.reserve_type = 'currency_defense';

  SELECT COALESCE(balance_frozen_pdh, 0) INTO v_frozen_cheques
  FROM public.bank_main_account WHERE id = 'bank-main';

  v_custody := v_international + v_defense + v_frozen_cheques;

  IF v_custody > 0 THEN
    UPDATE public.bank_main_account
    SET balance_pdh = v_custody, updated_at = now()
    WHERE id = 'bank-main';
  END IF;
END $$;
