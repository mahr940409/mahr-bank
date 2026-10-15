CREATE TABLE public.banknote_denominations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  national_bank_id text NOT NULL REFERENCES public.national_banks(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  boxes_printed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (national_bank_id, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banknote_denominations TO anon, authenticated;
GRANT ALL ON public.banknote_denominations TO service_role;
ALTER TABLE public.banknote_denominations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on banknote_denominations" ON public.banknote_denominations FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_banknote_denominations_updated_at BEFORE UPDATE ON public.banknote_denominations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();