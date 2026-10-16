CREATE OR REPLACE FUNCTION public.withdraw_banknote_bundles(
  p_bank_id text, p_denomination_id text, p_bundles integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_denom public.banknote_denominations%ROWTYPE;
  v_treasury public.national_bank_accounts%ROWTYPE;
  v_amount numeric;
  v_available integer;
BEGIN
  IF p_bundles IS NULL OR p_bundles <= 0 THEN RAISE EXCEPTION 'La cantidad de fajos debe ser mayor que cero'; END IF;
  SELECT * INTO v_denom FROM public.banknote_denominations
    WHERE id = p_denomination_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Denominación inexistente'; END IF;
  v_available := v_denom.boxes_printed * 27 - v_denom.bundles_withdrawn;
  IF p_bundles > v_available THEN RAISE EXCEPTION 'No hay suficientes fajos disponibles'; END IF;
  v_amount := p_bundles * 16 * v_denom.value;

  SELECT * INTO v_treasury FROM public.national_bank_accounts
    WHERE national_bank_id = p_bank_id AND account_type = 'bank_treasury' FOR UPDATE;
  IF NOT FOUND OR v_treasury.balance_real < v_amount THEN RAISE EXCEPTION 'Efectivo insuficiente en la cuenta propia'; END IF;

  UPDATE public.banknote_denominations SET bundles_withdrawn = bundles_withdrawn + p_bundles, updated_at = now() WHERE id = v_denom.id;
  UPDATE public.national_bank_accounts SET balance_real = balance_real - v_amount, updated_at = now() WHERE id = v_treasury.id;
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, from_account_id, amount_local, currency_local, is_symbolic, description, status)
  VALUES (p_bank_id, 'cash_bundle_withdrawal', v_treasury.id, v_amount, NULL, false,
    format('Retiro físico de %s fajo(s) de denominación %s', p_bundles, v_denom.value), 'executed');
END; $$;

REVOKE ALL ON FUNCTION public.withdraw_banknote_bundles(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_banknote_bundles(text, text, integer) TO authenticated;
