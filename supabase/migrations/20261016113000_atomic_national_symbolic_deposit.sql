CREATE OR REPLACE FUNCTION public.deposit_national_symbolic(
  p_bank_id text, p_account_id text, p_amount numeric,
  p_currency_iso text, p_backing_currency text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_account public.national_bank_accounts%ROWTYPE;
  v_backing public.bank_backings%ROWTYPE;
  v_bank_currency text;
  v_local_rate numeric;
  v_backing_rate numeric;
  v_units numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  SELECT c.iso_symbol INTO v_bank_currency
    FROM public.national_banks nb JOIN public.countries co ON co.id = nb.country_id
    JOIN public.currencies c ON c.id = co.currency_id WHERE nb.id = p_bank_id;
  IF v_bank_currency = p_backing_currency THEN RAISE EXCEPTION 'No se puede usar la moneda propia como respaldo simbólico'; END IF;
  SELECT exchange_rate_to_pdh INTO v_local_rate FROM public.currencies WHERE iso_symbol = p_currency_iso;
  SELECT exchange_rate_to_pdh INTO v_backing_rate FROM public.currencies WHERE iso_symbol = p_backing_currency;
  IF v_local_rate IS NULL OR v_backing_rate IS NULL OR v_backing_rate <= 0 THEN RAISE EXCEPTION 'Tasa de conversión inexistente'; END IF;
  v_units := (p_amount * v_local_rate) / v_backing_rate;

  SELECT * INTO v_account FROM public.national_bank_accounts WHERE id = p_account_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND OR v_account.status <> 'active' THEN RAISE EXCEPTION 'Cuenta inexistente o inactiva'; END IF;
  IF v_account.backing_currency IS NOT NULL AND v_account.backing_amount > 0 AND v_account.backing_currency <> p_backing_currency THEN
    RAISE EXCEPTION 'La cuenta ya usa otro respaldo';
  END IF;
  SELECT * INTO v_backing FROM public.bank_backings
    WHERE bank_type = 'national' AND bank_id = p_bank_id AND currency_iso = p_backing_currency FOR UPDATE;
  IF NOT FOUND OR v_backing.amount - v_backing.frozen < v_units THEN RAISE EXCEPTION 'Respaldo disponible insuficiente'; END IF;

  UPDATE public.bank_backings SET frozen = frozen + v_units, updated_at = now() WHERE id = v_backing.id;
  UPDATE public.national_bank_accounts SET
    balance_symbolic = balance_symbolic + p_amount,
    backing_amount = backing_amount + v_units,
    backing_currency = p_backing_currency,
    updated_at = now() WHERE id = v_account.id;
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, to_account_id, amount_local, currency_local, backing_amount, backing_currency, is_symbolic, description, status)
  VALUES (p_bank_id, 'national_deposit', v_account.id, p_amount, p_currency_iso, v_units, p_backing_currency, true, 'Depósito simbólico atómico', 'executed');
END; $$;

REVOKE ALL ON FUNCTION public.deposit_national_symbolic(text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_national_symbolic(text, text, numeric, text, text) TO authenticated;
