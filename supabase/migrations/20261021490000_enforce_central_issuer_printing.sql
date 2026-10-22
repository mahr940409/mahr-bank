-- A national bank may print only when it is explicitly linked to the
-- monetary authority that issues its currency. Adopted currencies are
-- therefore non-printable by the adopting national bank.
CREATE OR REPLACE FUNCTION public.print_banknote_boxes(
  p_bank_id text, p_denomination_id text, p_boxes integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_denom public.banknote_denominations%ROWTYPE;
  v_currency public.currencies%ROWTYPE;
  v_country public.countries%ROWTYPE;
  v_bank public.national_banks%ROWTYPE;
  v_currency_id text;
  v_amount numeric;
  v_circulation numeric;
BEGIN
  IF p_boxes IS NULL OR p_boxes <= 0 THEN RAISE EXCEPTION 'La cantidad de cajas debe ser mayor que cero'; END IF;
  SELECT nb.* INTO v_bank
  FROM public.national_banks nb
  WHERE nb.id = p_bank_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Banco nacional inexistente'; END IF;
  SELECT co.* INTO v_country FROM public.countries co WHERE co.id = v_bank.country_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'País del banco inexistente'; END IF;
  v_currency_id := v_country.currency_id;
  SELECT * INTO v_currency FROM public.currencies WHERE id = v_currency_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Moneda del país inexistente'; END IF;
  IF v_currency.issuer_authority_id IS NULL
     OR v_bank.monetary_authority_id IS NULL
     OR v_currency.issuer_authority_id <> v_bank.monetary_authority_id THEN
    RAISE EXCEPTION 'Este banco no es la autoridad emisora de la moneda; no puede imprimirla';
  END IF;
  IF NOT v_country.can_issue_currency THEN
    RAISE EXCEPTION 'Este país usa una moneda adoptada y no puede imprimir billetes';
  END IF;
  IF COALESCE(v_currency.pdh_reserves, 0) <= 0 THEN RAISE EXCEPTION 'No hay respaldo de emisión suficiente'; END IF;
  SELECT * INTO v_denom FROM public.banknote_denominations
    WHERE id = p_denomination_id AND national_bank_id = p_bank_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Denominación inexistente'; END IF;
  v_amount := v_denom.value * 432 * p_boxes;
  v_circulation := GREATEST(0, v_currency.printed_amount - v_currency.burned_amount + v_amount);
  UPDATE public.currencies SET printed_amount = printed_amount + v_amount,
    exchange_rate_to_pdh = CASE WHEN is_fixed_rate THEN exchange_rate_to_pdh ELSE pdh_reserves / NULLIF(v_circulation, 0) END,
    updated_at = now() WHERE id = v_currency.id;
  UPDATE public.banknote_denominations SET boxes_printed = boxes_printed + p_boxes, updated_at = now() WHERE id = v_denom.id;
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, amount_local, currency_local, is_symbolic, description, status)
  VALUES (p_bank_id, 'banknote_printing', v_amount, v_currency.iso_symbol, false,
    format('Impresión autorizada de %s caja(s) de denominación %s', p_boxes, v_denom.value), 'executed');
END; $$;

REVOKE ALL ON FUNCTION public.print_banknote_boxes(text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.print_banknote_boxes(text,text,integer) TO authenticated;
