CREATE OR REPLACE FUNCTION public.process_bond_coupon_atomic(p_holding_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_holding public.bond_holdings; v_bond public.state_bonds; v_account public.accounts;
  v_row public.bank_backings; v_now timestamptz := now(); v_weeks integer;
  v_paid_weeks integer := 0; v_coupon numeric; v_paid_interest numeric := 0;
  v_principal numeric := 0; v_total numeric; v_available numeric := 0; v_matured boolean;
  v_rate numeric; v_free numeric; v_needed numeric; v_units numeric;
BEGIN
  SELECT * INTO v_holding FROM public.bond_holdings WHERE id = p_holding_id FOR UPDATE;
  IF v_holding.id IS NULL THEN RAISE EXCEPTION 'Tenencia de bono no encontrada'; END IF;
  IF v_holding.status <> 'active' THEN RETURN jsonb_build_object('paid', 0, 'total', 0); END IF;
  SELECT * INTO v_bond FROM public.state_bonds WHERE id = v_holding.bond_id FOR UPDATE;
  SELECT * INTO v_account FROM public.accounts WHERE id = v_holding.account_id FOR UPDATE;
  IF v_account.id IS NULL OR v_bond.id IS NULL THEN RAISE EXCEPTION 'Datos del bono incompletos'; END IF;

  FOR v_row IN SELECT * FROM public.bank_backings
    WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id FOR UPDATE LOOP
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh
        ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END
       FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 THEN v_available := v_available + v_free * v_rate; END IF;
  END LOOP;

  v_weeks := greatest(0, floor(extract(epoch FROM (v_now - v_holding.last_coupon_at)) / (7 * 24 * 60 * 60))::integer);
  v_coupon := v_holding.principal_pdh * (v_bond.annual_rate / 52 / 100);
  v_matured := v_now >= v_holding.maturity_at;
  IF v_coupon > 0 THEN v_paid_weeks := least(v_weeks, floor(v_available / v_coupon)::integer); END IF;
  v_paid_interest := v_paid_weeks * v_coupon;
  v_available := v_available - v_paid_interest;
  IF v_matured AND v_available + 1e-9 >= v_holding.principal_pdh THEN v_principal := v_holding.principal_pdh; END IF;
  IF v_paid_weeks = 0 AND v_principal = 0 THEN RETURN jsonb_build_object('paid', 0, 'total', 0); END IF;
  v_total := v_paid_interest + v_principal;

  v_needed := v_total;
  FOR v_row IN SELECT * FROM public.bank_backings
    WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id ORDER BY currency_iso FOR UPDATE LOOP
    EXIT WHEN v_needed <= 1e-9;
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh
        ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END
       FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 AND v_free > 0 THEN
      v_units := least(v_free, v_needed / v_rate);
      UPDATE public.bank_backings SET amount = amount - v_units, updated_at = now() WHERE id = v_row.id;
      v_needed := v_needed - v_units * v_rate;
    END IF;
  END LOOP;
  IF v_needed > 1e-6 THEN RAISE EXCEPTION 'Respaldo insuficiente para pagar el bono'; END IF;
  UPDATE public.accounts SET balance_pdh = balance_pdh + v_total, updated_at = now() WHERE id = v_account.id;
  UPDATE public.bond_holdings SET last_coupon_at = v_holding.last_coupon_at + make_interval(days => v_paid_weeks * 7),
    coupons_paid = v_holding.coupons_paid + v_paid_weeks, total_interest_pdh = v_holding.total_interest_pdh + v_paid_interest,
    status = CASE WHEN v_principal > 0 THEN 'matured' ELSE 'active' END WHERE id = v_holding.id;
  INSERT INTO public.transactions (id, transaction_type, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8),
      'cdt_interest_payout', v_account.id, v_account.account_number, v_total, 'PDH',
      CASE WHEN v_principal > 0 THEN 'Bono vencido: capital + cupones pendientes' ELSE 'Pago de cupón de bono' END);
  RETURN jsonb_build_object('paid', v_paid_weeks, 'total', v_total);
END; $$;

REVOKE ALL ON FUNCTION public.process_bond_coupon_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_bond_coupon_atomic(text) TO authenticated;
