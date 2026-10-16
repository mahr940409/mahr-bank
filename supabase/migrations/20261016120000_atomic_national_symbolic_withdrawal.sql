CREATE OR REPLACE FUNCTION public.withdraw_national_symbolic(
  p_bank_id text, p_account_id text, p_amount numeric, p_currency_iso text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_account public.national_bank_accounts%ROWTYPE;
  v_backing public.bank_backings%ROWTYPE;
  v_release numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  SELECT * INTO v_account FROM public.national_bank_accounts
    WHERE id = p_account_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND OR v_account.status <> 'active' THEN RAISE EXCEPTION 'Cuenta inexistente o inactiva'; END IF;
  IF v_account.balance_symbolic < p_amount THEN RAISE EXCEPTION 'Saldo simbólico insuficiente'; END IF;
  IF v_account.backing_currency IS NULL OR v_account.backing_amount <= 0 THEN RAISE EXCEPTION 'La cuenta no tiene respaldo simbólico'; END IF;
  v_release := v_account.backing_amount * p_amount / v_account.balance_symbolic;

  SELECT * INTO v_backing FROM public.bank_backings
    WHERE bank_type = 'national' AND bank_id = p_bank_id AND currency_iso = v_account.backing_currency FOR UPDATE;
  IF NOT FOUND OR v_backing.frozen < v_release THEN RAISE EXCEPTION 'Respaldo congelado insuficiente'; END IF;

  UPDATE public.bank_backings SET frozen = frozen - v_release, updated_at = now() WHERE id = v_backing.id;
  UPDATE public.national_bank_accounts SET
    balance_symbolic = balance_symbolic - p_amount,
    backing_amount = GREATEST(0, backing_amount - v_release),
    backing_currency = CASE WHEN balance_symbolic - p_amount <= 0 THEN NULL ELSE backing_currency END,
    updated_at = now() WHERE id = v_account.id;
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, from_account_id, amount_local, currency_local, backing_amount, backing_currency, is_symbolic, description, status)
  VALUES (p_bank_id, 'national_withdrawal', v_account.id, p_amount, p_currency_iso, v_release, v_account.backing_currency, true, 'Retiro simbólico atómico', 'executed');
END; $$;

REVOKE ALL ON FUNCTION public.withdraw_national_symbolic(text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_national_symbolic(text, text, numeric, text) TO authenticated;
