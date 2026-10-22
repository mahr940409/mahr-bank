-- MAHR controls reserve custody but does not count it as its operational balance.
-- National-bank reserve changes update bank_backings/custody only.
CREATE OR REPLACE FUNCTION public.adjust_national_backing_atomic(p_bank_id text, p_currency text, p_delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_backing public.bank_backings;
  v_rate numeric;
  v_own text;
  v_custody numeric;
  v_frozen numeric;
BEGIN
  IF p_delta = 0 THEN RAISE EXCEPTION 'El ajuste no puede ser cero'; END IF;
  SELECT c.iso_symbol INTO v_own FROM public.national_banks nb
    JOIN public.countries co ON co.id = nb.country_id
    JOIN public.currencies c ON c.id = co.currency_id WHERE nb.id = p_bank_id;
  IF v_own IS NULL THEN RAISE EXCEPTION 'Banco nacional no encontrado'; END IF;
  IF upper(p_currency) = v_own THEN RAISE EXCEPTION 'No se puede respaldar con la moneda propia del banco'; END IF;
  SELECT CASE WHEN c.iso_symbol = 'PDH' THEN 1 WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh
    ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END
    INTO v_rate FROM public.currencies c WHERE c.iso_symbol = upper(p_currency);
  IF coalesce(v_rate, 0) <= 0 THEN RAISE EXCEPTION 'La moneda no tiene valor definido'; END IF;
  SELECT * INTO v_backing FROM public.bank_backings
    WHERE bank_type = 'national' AND bank_id = p_bank_id AND currency_iso = upper(p_currency) FOR UPDATE;
  IF v_backing.id IS NULL THEN
    IF p_delta < 0 THEN RAISE EXCEPTION 'Respaldo insuficiente'; END IF;
    INSERT INTO public.bank_backings (bank_type, bank_id, currency_iso, amount, frozen)
      VALUES ('national', p_bank_id, upper(p_currency), p_delta, 0) RETURNING * INTO v_backing;
  ELSE
    IF p_delta < 0 AND v_backing.amount - v_backing.frozen + 1e-9 < abs(p_delta) THEN
      RAISE EXCEPTION 'La parte disponible del respaldo es insuficiente';
    END IF;
    UPDATE public.bank_backings SET amount = amount + p_delta, updated_at = now() WHERE id = v_backing.id;
  END IF;
  SELECT amount, frozen INTO v_custody, v_frozen FROM public.bank_backings WHERE id = v_backing.id;
  INSERT INTO public.national_bank_custody_accounts (national_bank_id, custody_type, currency_iso, amount, frozen)
    VALUES (p_bank_id, 'international_backing', upper(p_currency), v_custody, v_frozen)
    ON CONFLICT (national_bank_id, custody_type, currency_iso)
    DO UPDATE SET amount = excluded.amount, frozen = excluded.frozen, updated_at = now();
  INSERT INTO public.national_bank_transactions
    (national_bank_id, transaction_type, backing_amount, backing_currency, description, status)
    VALUES (p_bank_id, CASE WHEN p_delta > 0 THEN 'mahr_deposit_backing' ELSE 'mahr_withdraw_backing' END,
      abs(p_delta), upper(p_currency), CASE WHEN p_delta > 0 THEN 'Respaldo controlado por MAHR' ELSE 'Retiro de respaldo controlado por MAHR' END, 'executed');
END; $$;

-- One-time repair of the duplicated operational balance created by the old model.
DO $$
DECLARE v_commitment numeric;
BEGIN
  SELECT COALESCE(SUM(x.amount * CASE WHEN upper(x.currency_iso) = 'PDH' THEN 1
    WHEN GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)) > 0
      THEN COALESCE(c.pdh_reserves, 0) / NULLIF(GREATEST(0, COALESCE(c.printed_amount, 0) - COALESCE(c.burned_amount, 0)), 0)
    ELSE COALESCE(c.exchange_rate_to_pdh, 0) END), 0) INTO v_commitment
  FROM (
    SELECT amount, currency_iso FROM public.bank_backings WHERE bank_type = 'national'
    UNION ALL
    SELECT amount, currency_iso FROM public.mahr_reserve_custody
  ) x LEFT JOIN public.currencies c ON c.iso_symbol = upper(x.currency_iso);
  UPDATE public.bank_main_account
  SET balance_pdh = GREATEST(0, balance_pdh - v_commitment), updated_at = now()
  WHERE id = 'bank-main' AND balance_pdh <= v_commitment;
END $$;

REVOKE ALL ON FUNCTION public.adjust_national_backing_atomic(text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_national_backing_atomic(text,text,numeric) TO authenticated;
