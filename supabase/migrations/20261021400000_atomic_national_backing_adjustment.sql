CREATE OR REPLACE FUNCTION public.adjust_national_backing_atomic(p_bank_id text, p_currency text, p_delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_backing public.bank_backings; v_main public.bank_main_account; v_rate numeric; v_value numeric;
  v_own text; v_custody numeric; v_frozen numeric;
BEGIN
  IF p_delta = 0 THEN RAISE EXCEPTION 'El ajuste no puede ser cero'; END IF;
  SELECT c.iso_symbol INTO v_own FROM public.national_banks nb JOIN public.countries co ON co.id = nb.country_id JOIN public.currencies c ON c.id = co.currency_id WHERE nb.id = p_bank_id;
  IF v_own IS NULL THEN RAISE EXCEPTION 'Banco nacional no encontrado'; END IF;
  IF upper(p_currency) = v_own THEN RAISE EXCEPTION 'No se puede respaldar con la moneda propia del banco'; END IF;
  SELECT CASE WHEN c.iso_symbol = 'PDH' THEN 1 WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END INTO v_rate FROM public.currencies c WHERE c.iso_symbol = upper(p_currency);
  IF coalesce(v_rate, 0) <= 0 THEN RAISE EXCEPTION 'La moneda no tiene valor definido'; END IF;
  SELECT * INTO v_main FROM public.bank_main_account WHERE id = 'bank-main' FOR UPDATE;
  IF v_main.id IS NULL THEN RAISE EXCEPTION 'Cuenta MAHR Bank no encontrada'; END IF;
  SELECT * INTO v_backing FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = p_bank_id AND currency_iso = upper(p_currency) FOR UPDATE;
  IF v_backing.id IS NULL THEN
    IF p_delta < 0 THEN RAISE EXCEPTION 'Respaldo insuficiente'; END IF;
    INSERT INTO public.bank_backings (bank_type, bank_id, currency_iso, amount, frozen) VALUES ('national', p_bank_id, upper(p_currency), p_delta, 0) RETURNING * INTO v_backing;
  ELSE
    IF p_delta < 0 AND v_backing.amount - v_backing.frozen + 1e-9 < abs(p_delta) THEN RAISE EXCEPTION 'La parte disponible del respaldo es insuficiente'; END IF;
    UPDATE public.bank_backings SET amount = amount + p_delta, updated_at = now() WHERE id = v_backing.id;
  END IF;
  v_value := p_delta * v_rate;
  IF p_delta < 0 AND v_main.balance_pdh + v_value < -1e-9 THEN RAISE EXCEPTION 'MAHR Bank no tiene fondos para devolver el respaldo'; END IF;
  UPDATE public.bank_main_account SET balance_pdh = balance_pdh + v_value, updated_at = now() WHERE id = 'bank-main';
  SELECT amount, frozen INTO v_custody, v_frozen FROM public.bank_backings WHERE id = v_backing.id;
  INSERT INTO public.national_bank_custody_accounts (national_bank_id, custody_type, currency_iso, amount, frozen)
    VALUES (p_bank_id, 'international_backing', upper(p_currency), v_custody, v_frozen)
    ON CONFLICT (national_bank_id, custody_type, currency_iso) DO UPDATE SET amount = excluded.amount, frozen = excluded.frozen, updated_at = now();
  INSERT INTO public.national_bank_transactions (national_bank_id, transaction_type, backing_amount, backing_currency, description, status)
    VALUES (p_bank_id, CASE WHEN p_delta > 0 THEN 'mahr_deposit_backing' ELSE 'mahr_withdraw_backing' END, abs(p_delta), upper(p_currency), CASE WHEN p_delta > 0 THEN 'Depósito de respaldo internacional en MAHR Bank' ELSE 'Retiro de respaldo internacional desde MAHR Bank' END, 'executed');
END; $$;
REVOKE ALL ON FUNCTION public.adjust_national_backing_atomic(text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_national_backing_atomic(text,text,numeric) TO authenticated;
