CREATE OR REPLACE FUNCTION public.deposit_national_physical(
  p_bank_id text, p_account_id text, p_amount numeric, p_currency_iso text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_treasury public.national_bank_accounts%ROWTYPE; v_account public.national_bank_accounts%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  SELECT * INTO v_treasury FROM public.national_bank_accounts
    WHERE national_bank_id = p_bank_id AND account_type = 'bank_treasury' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El banco no tiene cuenta propia'; END IF;
  SELECT * INTO v_account FROM public.national_bank_accounts
    WHERE id = p_account_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND OR v_account.status <> 'active' THEN RAISE EXCEPTION 'Cuenta destino inexistente o inactiva'; END IF;
  IF v_treasury.balance_real < p_amount THEN RAISE EXCEPTION 'Efectivo insuficiente en la bóveda del banco'; END IF;

  UPDATE public.national_bank_accounts SET balance_real = balance_real - p_amount, updated_at = now() WHERE id = v_treasury.id;
  UPDATE public.national_bank_accounts SET balance_real = balance_real + p_amount, updated_at = now() WHERE id = v_account.id;
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, from_account_id, to_account_id, amount_local, currency_local, is_symbolic, description, status)
  VALUES (p_bank_id, 'national_deposit', v_treasury.id, v_account.id, p_amount, p_currency_iso, false, 'Depósito físico atómico', 'executed');
END; $$;

CREATE OR REPLACE FUNCTION public.withdraw_national_physical(
  p_bank_id text, p_account_id text, p_amount numeric, p_currency_iso text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_treasury public.national_bank_accounts%ROWTYPE; v_account public.national_bank_accounts%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  SELECT * INTO v_treasury FROM public.national_bank_accounts
    WHERE national_bank_id = p_bank_id AND account_type = 'bank_treasury' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El banco no tiene cuenta propia'; END IF;
  SELECT * INTO v_account FROM public.national_bank_accounts
    WHERE id = p_account_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND OR v_account.status <> 'active' THEN RAISE EXCEPTION 'Cuenta origen inexistente o inactiva'; END IF;
  IF v_account.balance_real < p_amount THEN RAISE EXCEPTION 'Saldo real insuficiente'; END IF;

  UPDATE public.national_bank_accounts SET balance_real = balance_real - p_amount, updated_at = now() WHERE id = v_account.id;
  UPDATE public.national_bank_accounts SET balance_real = balance_real + p_amount, updated_at = now() WHERE id = v_treasury.id;
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, from_account_id, to_account_id, amount_local, currency_local, is_symbolic, description, status)
  VALUES (p_bank_id, 'national_withdrawal', v_account.id, v_treasury.id, p_amount, p_currency_iso, false, 'Retiro físico atómico', 'executed');
END; $$;

REVOKE ALL ON FUNCTION public.deposit_national_physical(text, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_national_physical(text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_national_physical(text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_national_physical(text, text, numeric, text) TO authenticated;
