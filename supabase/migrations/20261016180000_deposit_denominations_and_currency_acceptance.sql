-- Configuración explícita de monedas aceptadas por cada banco.
-- La ausencia de una fila significa "aceptada" para conservar compatibilidad.
CREATE TABLE IF NOT EXISTS public.bank_currency_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_type text NOT NULL CHECK (bank_type IN ('national', 'private')),
  bank_id text NOT NULL,
  currency_iso text NOT NULL,
  accepts_physical boolean NOT NULL DEFAULT true,
  accepts_symbolic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_type, bank_id, currency_iso)
);

ALTER TABLE public.bank_currency_acceptance ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_currency_acceptance TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bank_currency_acceptance'
      AND policyname = 'authenticated_manage_bank_currency_acceptance'
  ) THEN
    CREATE POLICY authenticated_manage_bank_currency_acceptance
      ON public.bank_currency_acceptance FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Detalle de billetes entregados en depósitos físicos.
ALTER TABLE public.national_bank_transactions
  ADD COLUMN IF NOT EXISTS denomination_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.private_bank_transactions
  ADD COLUMN IF NOT EXISTS denomination_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS denomination_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.national_bank_transactions.denomination_breakdown IS
  'Mapa denominación -> cantidad de billetes recibidos en el depósito físico.';
COMMENT ON COLUMN public.private_bank_transactions.denomination_breakdown IS
  'Mapa denominación -> cantidad de billetes recibidos en el depósito físico.';
COMMENT ON COLUMN public.transactions.denomination_breakdown IS
  'Mapa denominación -> cantidad de billetes recibidos en el depósito físico.';
