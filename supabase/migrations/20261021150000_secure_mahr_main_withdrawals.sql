CREATE OR REPLACE FUNCTION public.withdraw_mahr_main_account(p_amount_pdh numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_committed numeric;
  v_new_balance numeric;
BEGIN
  IF p_amount_pdh IS NULL OR p_amount_pdh <= 0 THEN
    RAISE EXCEPTION 'El monto de retiro debe ser mayor que cero';
  END IF;

  SELECT balance_pdh INTO v_balance
  FROM public.bank_main_account
  WHERE id = 'bank-main'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta principal del MAHR Bank inexistente'; END IF;

  SELECT COALESCE(SUM(bb.amount * CASE
    WHEN bb.currency_iso = 'PDH' THEN 1
    WHEN GREATEST(0, c.printed_amount - c.burned_amount) > 0
      THEN c.pdh_reserves / NULLIF(GREATEST(0, c.printed_amount - c.burned_amount), 0)
    ELSE c.exchange_rate_to_pdh
  END), 0)
  INTO v_committed
  FROM public.bank_backings bb
  LEFT JOIN public.currencies c ON c.iso_symbol = bb.currency_iso
  WHERE bb.bank_type = 'national';

  v_new_balance := v_balance - p_amount_pdh;
  IF v_new_balance < v_committed THEN
    RAISE EXCEPTION 'Retiro bloqueado: existen % PDH comprometidos como respaldo internacional',
      to_char(v_committed, 'FM999999999999990.00');
  END IF;

  UPDATE public.bank_main_account
  SET balance_pdh = v_new_balance, updated_at = now()
  WHERE id = 'bank-main';
  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_mahr_main_account(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_mahr_main_account(numeric) TO authenticated;
