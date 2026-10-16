-- Custodia física de billetes por banco y denominación.
-- La emisión total sigue siendo la suma de cajas impresas * 16; mover billetes
-- entre bancos cambia su ubicación, pero nunca crea billetes nuevos.
CREATE TABLE IF NOT EXISTS public.banknote_custody (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_type text NOT NULL CHECK (bank_type IN ('national', 'private')),
  bank_id text NOT NULL,
  -- Se mantiene como texto porque algunas instalaciones antiguas no tienen
  -- una clave única referenciable en banknote_denominations.id.
  denomination_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_type, bank_id, denomination_id)
);

ALTER TABLE public.banknote_custody ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banknote_custody TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'banknote_custody'
      AND policyname = 'authenticated_manage_banknote_custody'
  ) THEN
    CREATE POLICY authenticated_manage_banknote_custody
      ON public.banknote_custody FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Cantidad que puede recibirse desde fuera de los bancos para una denominación.
CREATE OR REPLACE FUNCTION public.available_banknote_circulation(p_denomination_id text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(0,
    (d.boxes_printed * 16) -
    COALESCE((SELECT SUM(c.quantity) FROM public.banknote_custody c
      WHERE c.denomination_id = d.id), 0)
  )::integer
  FROM public.banknote_denominations d
  WHERE d.id = p_denomination_id;
$$;

REVOKE ALL ON FUNCTION public.available_banknote_circulation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.available_banknote_circulation(text) TO authenticated;
