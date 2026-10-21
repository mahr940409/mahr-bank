WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY holding_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.bond_market_orders
  WHERE status = 'open'
)
DELETE FROM public.bond_market_orders o
USING ranked r
WHERE o.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_open_bond_market_order_per_holding
  ON public.bond_market_orders(holding_id)
  WHERE status = 'open';
