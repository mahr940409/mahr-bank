CREATE OR REPLACE FUNCTION public.deposit_mahr_account(
  p_account_id text, p_net_amount numeric, p_commission_pdh numeric,
  p_amount numeric, p_currency text, p_commission numeric, p_description text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_account public.accounts%ROWTYPE; v_bank public.bank_main_account%ROWTYPE;
BEGIN
  IF p_net_amount <= 0 THEN RAISE EXCEPTION 'El monto neto debe ser mayor que cero'; END IF;
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta inexistente'; END IF;
  SELECT * INTO v_bank FROM public.bank_main_account WHERE id = 'bank-main' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta principal inexistente'; END IF;
  UPDATE public.accounts SET balance_pdh = balance_pdh + p_net_amount, balance_real = balance_real + p_net_amount, updated_at = now() WHERE id = v_account.id;
  UPDATE public.bank_main_account SET balance_pdh = balance_pdh + COALESCE(p_commission_pdh, 0), updated_at = now() WHERE id = 'bank-main';
  INSERT INTO public.transactions (id, transaction_type, to_account_id, to_account_number, amount, currency, commission, commission_currency, description)
  VALUES ('TXN-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'deposit', v_account.id, v_account.account_number, p_amount, p_currency, NULLIF(p_commission, 0), NULLIF(p_currency, ''), COALESCE(p_description, 'Depósito atómico'));
END; $$;

CREATE OR REPLACE FUNCTION public.withdraw_mahr_account(
  p_account_id text, p_amount_account numeric, p_amount numeric,
  p_currency text, p_description text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_account public.accounts%ROWTYPE;
BEGIN
  IF p_amount_account <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta inexistente'; END IF;
  IF v_account.balance_pdh < p_amount_account THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  UPDATE public.accounts SET balance_pdh = balance_pdh - p_amount_account, balance_real = GREATEST(0, balance_real - p_amount_account), updated_at = now() WHERE id = v_account.id;
  INSERT INTO public.transactions (id, transaction_type, from_account_id, from_account_number, amount, currency, description)
  VALUES ('TXN-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'withdrawal', v_account.id, v_account.account_number, p_amount, p_currency, COALESCE(p_description, 'Retiro atómico'));
END; $$;

REVOKE ALL ON FUNCTION public.deposit_mahr_account(text, numeric, numeric, numeric, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_mahr_account(text, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_mahr_account(text, numeric, numeric, numeric, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_mahr_account(text, numeric, numeric, text, text) TO authenticated;
