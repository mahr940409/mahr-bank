-- MAHR Bank: the main account contains custody funds, not only free liquidity.
-- Never allow an operation withdrawal to consume international backing,
-- currency-defense custody, or funds frozen for bank cheques.
CREATE OR REPLACE FUNCTION public.withdraw_mahr_main_account(p_amount_pdh numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_international numeric := 0;
  v_currency_defense numeric := 0;
  v_frozen_cheques numeric := 0;
  v_committed numeric := 0;
  v_new_balance numeric;
BEGIN
  IF p_amount_pdh IS NULL OR p_amount_pdh <= 0 THEN
    RAISE EXCEPTION 'El monto de retiro debe ser mayor que cero';
  END IF;

  SELECT balance_pdh, COALESCE(balance_frozen_pdh, 0)
    INTO v_balance, v_frozen_cheques
  FROM public.bank_main_account
  WHERE id = 'bank-main'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta principal del MAHR Bank inexistente';
  END IF;

  -- Every national-bank backing is held by MAHR for international settlement.
  -- It is not free operational cash, regardless of its current currency value.
  SELECT COALESCE(SUM(
    bb.amount * CASE
      WHEN upper(bb.currency_iso) = 'PDH' THEN 1
      WHEN GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)) > 0
        THEN COALESCE(c.pdh_reserves, 0)
          / NULLIF(GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)), 0)
      ELSE COALESCE(c.exchange_rate_to_pdh, 0)
    END
  ), 0)
  INTO v_international
  FROM public.bank_backings bb
  LEFT JOIN public.currencies c ON c.iso_symbol = upper(bb.currency_iso)
  WHERE bb.bank_type = 'national';

  -- Currency-defense custody is a different purpose, but is also not free
  -- operating liquidity and must remain in MAHR custody.
  SELECT COALESCE(SUM(
    rc.amount * CASE
      WHEN upper(rc.currency_iso) = 'PDH' THEN 1
      WHEN GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)) > 0
        THEN COALESCE(c.pdh_reserves, 0)
          / NULLIF(GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)), 0)
      ELSE COALESCE(c.exchange_rate_to_pdh, 0)
    END
  ), 0)
  INTO v_currency_defense
  FROM public.mahr_reserve_custody rc
  LEFT JOIN public.currencies c ON c.iso_symbol = upper(rc.currency_iso)
  WHERE rc.reserve_type = 'currency_defense';

  v_committed := GREATEST(0, v_international)
    + GREATEST(0, v_currency_defense)
    + GREATEST(0, v_frozen_cheques);
  v_new_balance := v_balance - p_amount_pdh;

  IF v_new_balance < v_committed THEN
    RAISE EXCEPTION
      'Retiro bloqueado: % PDH están comprometidos. Internacional: %, defensa monetaria: %, cheques: %',
      to_char(v_committed, 'FM999999999999990.00'),
      to_char(v_international, 'FM999999999999990.00'),
      to_char(v_currency_defense, 'FM999999999999990.00'),
      to_char(v_frozen_cheques, 'FM999999999999990.00');
  END IF;

  UPDATE public.bank_main_account
  SET balance_pdh = v_new_balance, updated_at = now()
  WHERE id = 'bank-main';
  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_mahr_main_account(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_mahr_main_account(numeric) TO authenticated;
