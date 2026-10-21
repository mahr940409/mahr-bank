CREATE TABLE IF NOT EXISTS public.bond_purchase_orders (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bond_id text NOT NULL,
  account_id text NOT NULL,
  units numeric NOT NULL CHECK (units > 0),
  unit_price numeric NOT NULL CHECK (unit_price > 0),
  principal_denom numeric NOT NULL CHECK (principal_denom > 0),
  principal_pdh numeric NOT NULL CHECK (principal_pdh > 0),
  fee_pdh numeric NOT NULL DEFAULT 0 CHECK (fee_pdh >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','cancelled','rejected')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bond_orders_account_status
  ON public.bond_purchase_orders(account_id, status);
CREATE INDEX IF NOT EXISTS idx_bond_orders_bond_status
  ON public.bond_purchase_orders(bond_id, status);

ALTER TABLE public.bond_purchase_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.bond_purchase_orders TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bond_purchase_orders'
      AND policyname = 'authenticated_manage_bond_purchase_orders'
  ) THEN
    CREATE POLICY authenticated_manage_bond_purchase_orders
      ON public.bond_purchase_orders FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
