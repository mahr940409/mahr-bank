CREATE OR REPLACE FUNCTION public.settle_bond_purchase_order(p_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.bond_purchase_orders%ROWTYPE;
  v_bond public.state_bonds%ROWTYPE;
  v_account public.accounts%ROWTYPE;
  v_bank_id text;
  v_total numeric;
  v_backing_currency text;
BEGIN
  SELECT * INTO v_order
  FROM public.bond_purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de bono no encontrada.'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'La orden ya no está pendiente.'; END IF;
  IF v_order.expires_at <= now() THEN
    UPDATE public.bond_purchase_orders SET status = 'cancelled' WHERE id = p_order_id;
    RAISE EXCEPTION 'La orden de bono expiró.';
  END IF;

  SELECT * INTO v_bond FROM public.state_bonds WHERE id = v_order.bond_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bono no encontrado.'; END IF;
  IF v_bond.status <> 'active' OR v_bond.available_units < v_order.units THEN
    RAISE EXCEPTION 'El bono ya no tiene unidades disponibles.';
  END IF;

  SELECT * INTO v_account FROM public.accounts WHERE id = v_order.account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta compradora no encontrada.'; END IF;
  v_total := v_order.principal_pdh + v_order.fee_pdh;
  IF v_account.balance_pdh < v_total THEN RAISE EXCEPTION 'Saldo PDH insuficiente.'; END IF;

  v_bank_id := v_bond.national_bank_id;
  v_backing_currency := CASE WHEN v_bond.denom_mode = 'kyd' THEN 'KYD' ELSE 'PDH' END;

  UPDATE public.accounts SET balance_pdh = balance_pdh - v_total, updated_at = now() WHERE id = v_account.id;
  UPDATE public.state_bonds SET available_units = available_units - v_order.units, updated_at = now() WHERE id = v_bond.id;

  INSERT INTO public.bond_holdings (
    bond_id, account_id, units, principal_pdh, principal_denom,
    purchased_at, maturity_at, last_coupon_at
  ) VALUES (
    v_bond.id, v_account.id, v_order.units, v_order.principal_pdh, v_order.principal_denom,
    now(), now() + (v_bond.term_weeks * interval '1 week'), now()
  );

  INSERT INTO public.transactions (
    id, transaction_type, from_account_id, from_account_number, amount, currency, description
  ) VALUES (
    gen_random_uuid()::text, 'cdt_creation', v_account.id, v_account.account_number, v_total, 'PDH',
    'Liquidación de compra de bono ' || v_bond.name
  );

  UPDATE public.bond_purchase_orders
  SET status = 'settled', settled_at = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_bond_purchase_order(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_bond_purchase_order(text) TO authenticated;
