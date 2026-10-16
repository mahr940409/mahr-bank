CREATE OR REPLACE FUNCTION public.transfer_mahr_accounts(
  p_from_account_id text, p_to_account_id text, p_amount numeric,
  p_commission numeric, p_currency text, p_description text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_from public.accounts%ROWTYPE;
  v_to public.accounts%ROWTYPE;
  v_bank public.bank_main_account%ROWTYPE;
  v_total numeric := p_amount + COALESCE(p_commission, 0);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Las cuentas deben ser diferentes'; END IF;
  SELECT * INTO v_from FROM public.accounts WHERE id = p_from_account_id FOR UPDATE;
  SELECT * INTO v_to FROM public.accounts WHERE id = p_to_account_id FOR UPDATE;
  IF NOT FOUND OR v_from.id IS NULL OR v_to.id IS NULL THEN RAISE EXCEPTION 'Cuenta inexistente'; END IF;
  IF v_from.account_type NOT IN ('personal', 'business') OR v_to.account_type NOT IN ('personal', 'business') THEN RAISE EXCEPTION 'Tipo de cuenta inválido'; END IF;
  IF v_from.balance_pdh < v_total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  IF COALESCE(p_commission, 0) > 0 THEN
    SELECT * INTO v_bank FROM public.bank_main_account WHERE id = 'bank-main' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta principal del banco inexistente'; END IF;
    UPDATE public.bank_main_account SET balance_pdh = balance_pdh + p_commission, updated_at = now() WHERE id = 'bank-main';
  END IF;
  UPDATE public.accounts SET balance_pdh = balance_pdh - v_total, balance_real = GREATEST(0, balance_real - v_total), updated_at = now() WHERE id = v_from.id;
  UPDATE public.accounts SET balance_pdh = balance_pdh + p_amount, balance_real = balance_real + p_amount, updated_at = now() WHERE id = v_to.id;
  INSERT INTO public.transactions (id, transaction_type, from_account_id, from_account_number, to_account_id, to_account_number, amount, currency, commission, commission_currency, description)
  VALUES ('TXN-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'transfer', v_from.id, v_from.account_number, v_to.id, v_to.account_number, p_amount, p_currency, NULLIF(p_commission, 0), NULLIF(p_currency, ''), COALESCE(p_description, 'Transferencia atómica'));
END; $$;

REVOKE ALL ON FUNCTION public.transfer_mahr_accounts(text, text, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_mahr_accounts(text, text, numeric, numeric, text, text) TO authenticated;
