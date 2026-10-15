
-- Table to store commodity prices synced from external API
CREATE TABLE public.commodities (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  price_in_kyd numeric NOT NULL DEFAULT 0,
  trend text NOT NULL DEFAULT 'stable',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.commodities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on commodities"
  ON public.commodities FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Table to store user commodity deposits
CREATE TABLE public.commodity_deposits (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  account_id text NOT NULL,
  commodity_id text NOT NULL REFERENCES public.commodities(id),
  units numeric NOT NULL,
  price_at_deposit numeric NOT NULL,
  currency_at_deposit text NOT NULL DEFAULT 'PDH',
  total_value_at_deposit numeric NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.commodity_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on commodity_deposits"
  ON public.commodity_deposits FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
