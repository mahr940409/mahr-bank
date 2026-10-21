
-- Currencies table
CREATE TABLE public.currencies (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name text NOT NULL,
  iso_symbol text NOT NULL UNIQUE,
  exchange_rate_to_pdh numeric NOT NULL DEFAULT 1,
  is_fixed_rate boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on currencies"
  ON public.currencies FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- Countries table
CREATE TABLE public.countries (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name text NOT NULL UNIQUE,
  currency_id text NOT NULL REFERENCES public.currencies(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on countries"
  ON public.countries FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- Add updated_at triggers
CREATE TRIGGER update_currencies_updated_at
  BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed existing currencies
INSERT INTO public.currencies (id, name, iso_symbol, exchange_rate_to_pdh, is_fixed_rate) VALUES
  ('cur-pdh', 'Peso Digital Híbrido', 'PDH', 1, true),
  ('cur-bdh', 'Bolívar Digital Híbrido', 'BDH', 81, true),
  ('cur-ldh', 'Lira Digital Híbrido', 'LDH', 9, true),
  ('cur-kyd', 'Dólar de las Islas Caimán', 'KYD', 1, false);

-- Seed Cayman Islands
INSERT INTO public.countries (id, name, currency_id) VALUES
  ('country-cayman', 'The Cayman Islands', 'cur-kyd');
