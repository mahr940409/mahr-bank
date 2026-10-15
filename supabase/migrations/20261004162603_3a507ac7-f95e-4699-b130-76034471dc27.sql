CREATE TABLE public.bank_backings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bank_type text NOT NULL,
  bank_id text NOT NULL,
  currency_iso text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  frozen numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_type, bank_id, currency_iso)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_backings TO anon, authenticated;
GRANT ALL ON public.bank_backings TO service_role;
ALTER TABLE public.bank_backings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on bank_backings" ON public.bank_backings FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_bank_backings_updated_at BEFORE UPDATE ON public.bank_backings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();