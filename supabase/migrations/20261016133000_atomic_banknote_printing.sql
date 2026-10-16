CREATE OR REPLACE FUNCTION public.print_banknote_boxes(
  p_bank_id text, p_denomination_id text, p_boxes integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_denom public.banknote_denominations%ROWTYPE;
  v_currency public.currencies%ROWTYPE;
  v_currency_id text;
  v_amount numeric;
  v_circulation numeric;
BEGIN
  IF p_boxes IS NULL OR p_boxes <= 0 THEN RAISE EXCEPTION 'La cantidad de cajas debe ser mayor que cero'; END IF;
  SELECT co.currency_id INTO v_currency_id FROM public.national_banks nb JOIN public.countries co ON co.id = nb.country_id WHERE nb.id = p_bank_id;
  SELECT * INTO v_currency FROM public.currencies WHERE id = v_currency_id FOR UPDATE;
  IF NOT FOUND OR v_currency.pdh_reserves <= 0 THEN RAISE EXCEPTION 'No hay respaldo de emisión suficiente'; END IF;
  SELECT * INTO v_denom FROM public.banknote_denominations WHERE id = p_denomination_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Denominación inexistente'; END IF;
  v_amount := v_denom.value * 432 * p_boxes;
  v_circulation := GREATEST(0, v_currency.printed_amount - v_currency.burned_amount + v_amount);
  UPDATE public.currencies SET printed_amount = printed_amount + v_amount,
    exchange_rate_to_pdh = CASE WHEN is_fixed_rate THEN exchange_rate_to_pdh ELSE pdh_reserves / NULLIF(v_circulation, 0) END,
    updated_at = now() WHERE id = v_currency.id;
  UPDATE public.banknote_denominations SET boxes_printed = boxes_printed + p_boxes, updated_at = now() WHERE id = v_denom.id;
  INSERT INTO public.national_bank_transactions (national_bank_id, transaction_type, amount_local, currency_local, is_symbolic, description, status)
  VALUES (p_bank_id, 'banknote_printing', v_amount, v_currency.iso_symbol, false, format('Impresión de %s caja(s) de denominación %s', p_boxes, v_denom.value), 'executed');
END; $$;
REVOKE ALL ON FUNCTION public.print_banknote_boxes(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.print_banknote_boxes(text, text, integer) TO authenticated;
