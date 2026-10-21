-- Custodia física del MAHR separada por finalidad.
-- international_transactions: liquidación entre bancos.
-- currency_defense: respaldo físico que sostiene una moneda emitida.
CREATE TABLE IF NOT EXISTS public.mahr_reserve_custody (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reserve_type text NOT NULL CHECK (reserve_type IN ('international_transactions', 'currency_defense')),
  currency_iso text NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  frozen numeric NOT NULL DEFAULT 0 CHECK (frozen >= 0 AND frozen <= amount),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reserve_type, currency_iso)
);

ALTER TABLE public.mahr_reserve_custody ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read MAHR reserve custody"
  ON public.mahr_reserve_custody FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage MAHR reserve custody"
  ON public.mahr_reserve_custody FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mahr_reserve_custody TO authenticated;

DROP TRIGGER IF EXISTS update_mahr_reserve_custody_updated_at ON public.mahr_reserve_custody;
CREATE TRIGGER update_mahr_reserve_custody_updated_at
  BEFORE UPDATE ON public.mahr_reserve_custody
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
