CREATE OR REPLACE FUNCTION public.transfer_national_international(
  p_from_bank_id text, p_from_account_id text, p_to_bank_id text, p_to_account_id text,
  p_amount numeric, p_backing_currency text, p_receiver_symbolic boolean
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_from public.national_bank_accounts%ROWTYPE; v_to public.national_bank_accounts%ROWTYPE;
  v_from_backing public.bank_backings%ROWTYPE; v_to_backing public.bank_backings%ROWTYPE;
  v_from_iso text; v_to_iso text; v_backing_rate numeric; v_from_rate numeric; v_to_rate numeric;
  v_equiv_pdh numeric; v_amount_to numeric; v_units numeric; v_frozen numeric := 0;
  v_printed numeric; v_committed numeric; v_available numeric; v_currency_id text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  IF p_from_bank_id = p_to_bank_id THEN RAISE EXCEPTION 'Los bancos deben ser diferentes'; END IF;
  SELECT c.iso_symbol, c.exchange_rate_to_pdh INTO v_from_iso, v_from_rate
    FROM public.national_banks nb JOIN public.countries co ON co.id = nb.country_id JOIN public.currencies c ON c.id = co.currency_id WHERE nb.id = p_from_bank_id;
  SELECT c.iso_symbol, c.exchange_rate_to_pdh, c.id INTO v_to_iso, v_to_rate, v_currency_id
    FROM public.national_banks nb JOIN public.countries co ON co.id = nb.country_id JOIN public.currencies c ON c.id = co.currency_id WHERE nb.id = p_to_bank_id;
  SELECT exchange_rate_to_pdh INTO v_backing_rate FROM public.currencies WHERE iso_symbol = p_backing_currency;
  IF v_from_rate IS NULL OR v_to_rate IS NULL OR v_backing_rate IS NULL OR v_backing_rate <= 0 THEN RAISE EXCEPTION 'Tasa de conversión inexistente'; END IF;
  SELECT * INTO v_from FROM public.national_bank_accounts WHERE id = p_from_account_id AND national_bank_id = p_from_bank_id FOR UPDATE;
  SELECT * INTO v_to FROM public.national_bank_accounts WHERE id = p_to_account_id AND national_bank_id = p_to_bank_id FOR UPDATE;
  IF v_from.id IS NULL OR v_to.id IS NULL OR v_from.status <> 'active' OR v_to.status <> 'active' THEN RAISE EXCEPTION 'Cuenta inexistente o inactiva'; END IF;
  IF v_from.balance_real < p_amount THEN RAISE EXCEPTION 'Saldo real insuficiente en el origen'; END IF;

  v_equiv_pdh := p_amount * v_from_rate;
  v_amount_to := v_equiv_pdh / v_to_rate;
  v_units := v_equiv_pdh / v_backing_rate;
  SELECT * INTO v_from_backing FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = p_from_bank_id AND currency_iso = p_backing_currency FOR UPDATE;
  IF v_from_backing.id IS NULL OR v_from_backing.amount - v_from_backing.frozen < v_units THEN RAISE EXCEPTION 'Respaldo disponible insuficiente en el origen'; END IF;
  INSERT INTO public.bank_backings (bank_type, bank_id, currency_iso, amount, frozen) VALUES ('national', p_to_bank_id, p_backing_currency, 0, 0) ON CONFLICT (bank_type, bank_id, currency_iso) DO NOTHING;
  SELECT * INTO v_to_backing FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = p_to_bank_id AND currency_iso = p_backing_currency FOR UPDATE;

  IF p_receiver_symbolic THEN
    IF v_to.backing_currency IS NOT NULL AND v_to.backing_amount > 0 AND v_to.backing_currency <> p_backing_currency THEN RAISE EXCEPTION 'La cuenta receptora usa otro respaldo'; END IF;
    v_frozen := v_units;
  ELSE
    SELECT printed_amount - burned_amount INTO v_printed FROM public.currencies WHERE id = v_currency_id;
    SELECT COALESCE(SUM(a.balance_real), 0) INTO v_committed
      FROM public.national_bank_accounts a JOIN public.national_banks nb ON nb.id = a.national_bank_id JOIN public.countries co ON co.id = nb.country_id
      WHERE co.currency_id = v_currency_id AND a.account_type <> 'bank_treasury';
    v_available := GREATEST(0, v_printed - v_committed);
    IF v_amount_to > v_available THEN RAISE EXCEPTION 'Dinero físico insuficiente en el destino'; END IF;
  END IF;

  UPDATE public.bank_backings SET amount = amount - v_units, updated_at = now() WHERE id = v_from_backing.id;
  UPDATE public.bank_backings SET amount = amount + v_units, frozen = frozen + v_frozen, updated_at = now() WHERE id = v_to_backing.id;
  UPDATE public.national_bank_accounts SET balance_real = balance_real - p_amount, updated_at = now() WHERE id = v_from.id;
  UPDATE public.national_bank_accounts SET balance_real = CASE WHEN p_receiver_symbolic THEN balance_real ELSE balance_real + v_amount_to END,
    balance_symbolic = CASE WHEN p_receiver_symbolic THEN balance_symbolic + v_amount_to ELSE balance_symbolic END,
    backing_amount = backing_amount + v_frozen, backing_currency = CASE WHEN p_receiver_symbolic THEN p_backing_currency ELSE backing_currency END, updated_at = now() WHERE id = v_to.id;
  INSERT INTO public.national_bank_transactions (national_bank_id, transaction_type, from_account_id, to_account_id, counterparty_national_bank_id, amount_local, currency_local, backing_amount, backing_currency, is_symbolic, description, status)
  VALUES (p_from_bank_id, 'intl_send', v_from.id, v_to.id, p_to_bank_id, p_amount, v_from_iso, v_units, p_backing_currency, false, 'Envío internacional atómico', 'executed');
  INSERT INTO public.national_bank_transactions (national_bank_id, transaction_type, from_account_id, to_account_id, counterparty_national_bank_id, amount_local, currency_local, backing_amount, backing_currency, is_symbolic, description, status)
  VALUES (p_to_bank_id, 'intl_receive', v_from.id, v_to.id, p_from_bank_id, v_amount_to, v_to_iso, v_units, p_backing_currency, p_receiver_symbolic, 'Recepción internacional atómica', 'executed');
END; $$;

REVOKE ALL ON FUNCTION public.transfer_national_international(text, text, text, text, numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_national_international(text, text, text, text, numeric, text, boolean) TO authenticated;
