CREATE OR REPLACE FUNCTION public.execute_bond_market_order(p_order_id text, p_buyer_account_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.bond_market_orders%ROWTYPE; v_holding public.bond_holdings%ROWTYPE;
  v_buyer public.accounts%ROWTYPE; v_seller public.accounts%ROWTYPE; v_total numeric;
  v_bond public.state_bonds%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.bond_market_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'open' THEN RAISE EXCEPTION 'Orden no disponible'; END IF;
  SELECT * INTO v_holding FROM public.bond_holdings WHERE id = v_order.holding_id FOR UPDATE;
  SELECT * INTO v_bond FROM public.state_bonds WHERE id = v_holding.bond_id;
  IF NOT FOUND OR v_holding.account_id <> v_order.seller_account_id OR v_holding.status <> 'active' THEN RAISE EXCEPTION 'Tenencia no disponible'; END IF;
  IF v_order.units <> v_holding.units THEN RAISE EXCEPTION 'La orden debe vender la tenencia completa'; END IF;
  IF p_buyer_account_id = v_order.seller_account_id THEN RAISE EXCEPTION 'El comprador debe ser diferente'; END IF;
  SELECT * INTO v_buyer FROM public.accounts WHERE id = p_buyer_account_id FOR UPDATE;
  SELECT * INTO v_seller FROM public.accounts WHERE id = v_order.seller_account_id FOR UPDATE;
  IF v_buyer.id IS NULL OR v_seller.id IS NULL THEN RAISE EXCEPTION 'Cuenta compradora o vendedora no encontrada'; END IF;
  v_total := v_order.units * v_order.ask_price_pdh;
  IF v_buyer.balance_pdh < v_total THEN RAISE EXCEPTION 'Saldo PDH insuficiente'; END IF;
  UPDATE public.accounts SET balance_pdh = balance_pdh - v_total, updated_at = now() WHERE id = v_buyer.id;
  UPDATE public.accounts SET balance_pdh = balance_pdh + v_total, updated_at = now() WHERE id = v_seller.id;
  UPDATE public.bond_holdings SET account_id = v_buyer.id, updated_at = now() WHERE id = v_holding.id;
  INSERT INTO public.bond_market_trades (order_id, holding_id, seller_account_id, buyer_account_id, units, price_pdh, total_pdh)
    VALUES (v_order.id, v_holding.id, v_order.seller_account_id, v_buyer.id, v_order.units, v_order.ask_price_pdh, v_total);
  INSERT INTO public.transactions (id, transaction_type, from_account_id, from_account_number, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'transfer', v_buyer.id, v_buyer.account_number, v_seller.id, v_seller.account_number, v_total, 'PDH', 'Compra secundaria del bono ' || COALESCE(v_bond.name, v_holding.bond_id));
  UPDATE public.bond_market_orders SET status = 'filled' WHERE id = v_order.id;
END; $$;

REVOKE ALL ON FUNCTION public.execute_bond_market_order(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_bond_market_order(text,text) TO authenticated;
