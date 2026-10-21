CREATE OR REPLACE FUNCTION public.repurchase_bond_atomic(p_holding_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_holding public.bond_holdings; v_bond public.state_bonds; v_account public.accounts;
  v_row public.bank_backings; v_rate numeric; v_free numeric; v_available numeric;
  v_weeks integer; v_coupon numeric; v_due numeric; v_total numeric; v_needed numeric; v_units numeric;
BEGIN
  SELECT * INTO v_holding FROM public.bond_holdings WHERE id = p_holding_id FOR UPDATE;
  IF v_holding.id IS NULL THEN RAISE EXCEPTION 'Tenencia de bono no encontrada'; END IF;
  IF v_holding.status <> 'active' THEN RAISE EXCEPTION 'Tenencia no activa'; END IF;
  SELECT * INTO v_bond FROM public.state_bonds WHERE id = v_holding.bond_id FOR UPDATE;
  SELECT * INTO v_account FROM public.accounts WHERE id = v_holding.account_id FOR UPDATE;
  IF v_bond.id IS NULL OR v_account.id IS NULL THEN RAISE EXCEPTION 'Datos del bono incompletos'; END IF;
  v_weeks := greatest(0, floor(extract(epoch FROM (now() - v_holding.last_coupon_at)) / (7 * 24 * 60 * 60))::integer);
  v_coupon := v_holding.principal_pdh * (v_bond.annual_rate / 52 / 100);
  v_due := v_coupon * v_weeks;
  v_total := v_holding.principal_pdh + v_due;
  v_available := 0;
  FOR v_row IN SELECT * FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id FOR UPDATE LOOP
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 THEN v_available := v_available + v_free * v_rate; END IF;
  END LOOP;
  IF v_available + 1e-9 < v_total THEN RAISE EXCEPTION 'Respaldo insuficiente para la recompra'; END IF;
  v_needed := v_total;
  FOR v_row IN SELECT * FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id ORDER BY currency_iso FOR UPDATE LOOP
    EXIT WHEN v_needed <= 1e-9;
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 AND v_free > 0 THEN
      v_units := least(v_free, v_needed / v_rate);
      UPDATE public.bank_backings SET amount = amount - v_units, updated_at = now() WHERE id = v_row.id;
      v_needed := v_needed - v_units * v_rate;
    END IF;
  END LOOP;
  UPDATE public.accounts SET balance_pdh = balance_pdh + v_total, updated_at = now() WHERE id = v_account.id;
  UPDATE public.bond_holdings SET status = 'repurchased', coupons_paid = coupons_paid + v_weeks,
    total_interest_pdh = total_interest_pdh + v_due, last_coupon_at = now() WHERE id = v_holding.id;
  INSERT INTO public.transactions (id, transaction_type, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8),
      'cdt_liquidation', v_account.id, v_account.account_number, v_total, 'PDH',
      'Recompra anticipada de bono: capital + cupones pendientes');
END; $$;

REVOKE ALL ON FUNCTION public.repurchase_bond_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repurchase_bond_atomic(text) TO authenticated;
