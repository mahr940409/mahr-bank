CREATE OR REPLACE FUNCTION public.withdraw_national_with_substitution(
  p_bank_id text, p_account_id text, p_amount numeric, p_currency_iso text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_target public.national_bank_accounts%ROWTYPE;
  v_donor public.national_bank_accounts%ROWTYPE;
  v_remaining numeric := p_amount;
  v_take numeric;
  v_backing_take numeric;
  v_total_backing numeric;
  v_backing_currency text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  SELECT * INTO v_target FROM public.national_bank_accounts
    WHERE id = p_account_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'active' THEN RAISE EXCEPTION 'Cuenta solicitante inexistente o inactiva'; END IF;
  IF v_target.balance_symbolic < p_amount THEN RAISE EXCEPTION 'Saldo simbólico insuficiente para solicitar efectivo'; END IF;
  IF v_target.backing_currency IS NULL OR v_target.backing_amount <= 0 THEN RAISE EXCEPTION 'El saldo simbólico no tiene respaldo transferible'; END IF;
  v_backing_currency := v_target.backing_currency;
  v_total_backing := v_target.backing_amount;

  FOR v_donor IN
    SELECT * FROM public.national_bank_accounts
    WHERE national_bank_id = p_bank_id AND id <> p_account_id
      AND account_type <> 'bank_treasury' AND status = 'active' AND balance_real > 0
      AND (balance_symbolic = 0 OR backing_currency = v_backing_currency)
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_donor.balance_real);
    v_backing_take := v_total_backing * v_take / p_amount;

    UPDATE public.national_bank_accounts SET
      balance_real = balance_real - v_take,
      balance_symbolic = balance_symbolic + v_take,
      backing_amount = backing_amount + v_backing_take,
      backing_currency = v_backing_currency,
      updated_at = now()
    WHERE id = v_donor.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN RAISE EXCEPTION 'No hay suficiente efectivo comprometido para cubrir el retiro'; END IF;

  UPDATE public.national_bank_accounts SET
    balance_symbolic = balance_symbolic - p_amount,
    backing_amount = GREATEST(0, backing_amount - v_total_backing),
    backing_currency = CASE WHEN balance_symbolic - p_amount <= 0 THEN NULL ELSE backing_currency END,
    updated_at = now() WHERE id = v_target.id;
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, from_account_id, amount_local, currency_local, backing_amount, backing_currency, is_symbolic, description, status)
  VALUES (p_bank_id, 'national_withdrawal_substitution', v_target.id, p_amount, p_currency_iso, v_total_backing, v_backing_currency, true, 'Retiro físico con sustitución de respaldo', 'executed');
END; $$;

REVOKE ALL ON FUNCTION public.withdraw_national_with_substitution(text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_national_with_substitution(text, text, numeric, text) TO authenticated;
