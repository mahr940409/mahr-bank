CREATE TABLE IF NOT EXISTS public.bond_market_orders (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  holding_id text NOT NULL,
  seller_account_id text NOT NULL,
  units numeric NOT NULL CHECK (units > 0),
  ask_price_pdh numeric NOT NULL CHECK (ask_price_pdh > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.bond_market_trades (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id text NOT NULL,
  holding_id text NOT NULL,
  seller_account_id text NOT NULL,
  buyer_account_id text NOT NULL,
  units numeric NOT NULL CHECK (units > 0),
  price_pdh numeric NOT NULL CHECK (price_pdh > 0),
  total_pdh numeric NOT NULL CHECK (total_pdh > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bond_market_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bond_market_trades ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.bond_market_orders TO authenticated;
GRANT SELECT, INSERT ON public.bond_market_trades TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bond_market_orders' AND policyname = 'authenticated_manage_bond_market_orders') THEN
    CREATE POLICY authenticated_manage_bond_market_orders ON public.bond_market_orders
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bond_market_trades' AND policyname = 'authenticated_manage_bond_market_trades') THEN
    CREATE POLICY authenticated_manage_bond_market_trades ON public.bond_market_trades
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.execute_bond_market_order(p_order_id text, p_buyer_account_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.bond_market_orders%ROWTYPE;
  v_holding public.bond_holdings%ROWTYPE;
  v_buyer public.accounts%ROWTYPE;
  v_total numeric;
BEGIN
  SELECT * INTO v_order FROM public.bond_market_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'open' THEN RAISE EXCEPTION 'Orden no disponible.'; END IF;
  SELECT * INTO v_holding FROM public.bond_holdings WHERE id = v_order.holding_id FOR UPDATE;
  IF NOT FOUND OR v_holding.account_id <> v_order.seller_account_id OR v_holding.status <> 'active' THEN RAISE EXCEPTION 'Tenencia no disponible.'; END IF;
  IF v_order.units <> v_holding.units THEN RAISE EXCEPTION 'La orden debe vender la tenencia completa.'; END IF;
  IF p_buyer_account_id = v_order.seller_account_id THEN RAISE EXCEPTION 'El comprador debe ser diferente.'; END IF;
  SELECT * INTO v_buyer FROM public.accounts WHERE id = p_buyer_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta compradora no encontrada.'; END IF;
  v_total := v_order.units * v_order.ask_price_pdh;
  IF v_buyer.balance_pdh < v_total THEN RAISE EXCEPTION 'Saldo PDH insuficiente.'; END IF;

  UPDATE public.accounts SET balance_pdh = balance_pdh - v_total, updated_at = now() WHERE id = v_buyer.id;
  UPDATE public.accounts SET balance_pdh = balance_pdh + v_total, updated_at = now() WHERE id = v_order.seller_account_id;
  UPDATE public.bond_holdings SET account_id = v_buyer.id, updated_at = now() WHERE id = v_holding.id;
  INSERT INTO public.bond_market_trades (order_id, holding_id, seller_account_id, buyer_account_id, units, price_pdh, total_pdh)
    VALUES (v_order.id, v_holding.id, v_order.seller_account_id, v_buyer.id, v_order.units, v_order.ask_price_pdh, v_total);
  UPDATE public.bond_market_orders SET status = 'filled' WHERE id = v_order.id;
END $$;

REVOKE ALL ON FUNCTION public.execute_bond_market_order(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_bond_market_order(text, text) TO authenticated;
