-- Monetary issuers are independent from countries. This supports national,
-- regional and supranational central banks without creating sample data.
CREATE TABLE IF NOT EXISTS public.monetary_authorities (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL UNIQUE,
  authority_type text NOT NULL CHECK (authority_type IN ('national_central_bank', 'regional_central_bank', 'supranational_central_bank')),
  country_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS issuer_authority_id text;

ALTER TABLE public.national_banks
  ADD COLUMN IF NOT EXISTS monetary_authority_id text;

CREATE TABLE IF NOT EXISTS public.monetary_authority_denominations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  authority_id text NOT NULL,
  currency_id text NOT NULL,
  value numeric NOT NULL CHECK (value > 0),
  boxes_printed integer NOT NULL DEFAULT 0 CHECK (boxes_printed >= 0),
  bundles_withdrawn integer NOT NULL DEFAULT 0 CHECK (bundles_withdrawn >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authority_id, currency_id, value)
);

ALTER TABLE public.monetary_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetary_authority_denominations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage monetary authorities" ON public.monetary_authorities;
CREATE POLICY "Authenticated users can manage monetary authorities"
  ON public.monetary_authorities FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can manage authority denominations" ON public.monetary_authority_denominations;
CREATE POLICY "Authenticated users can manage authority denominations"
  ON public.monetary_authority_denominations FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monetary_authorities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monetary_authority_denominations TO authenticated;

-- Only the authority assigned as issuer can print the currency.
CREATE OR REPLACE FUNCTION public.print_authority_banknote_boxes(
  p_authority_id text, p_denomination_id text, p_boxes integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_authority public.monetary_authorities%ROWTYPE;
  v_denom public.monetary_authority_denominations%ROWTYPE;
  v_currency public.currencies%ROWTYPE;
  v_amount numeric;
  v_circulation numeric;
BEGIN
  IF p_boxes IS NULL OR p_boxes <= 0 THEN RAISE EXCEPTION 'La cantidad de cajas debe ser mayor que cero'; END IF;
  SELECT * INTO v_authority FROM public.monetary_authorities WHERE id = p_authority_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Autoridad monetaria inexistente o inactiva'; END IF;
  SELECT * INTO v_denom FROM public.monetary_authority_denominations
    WHERE id = p_denomination_id AND authority_id = p_authority_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Denominación inexistente para esta autoridad'; END IF;
  SELECT * INTO v_currency FROM public.currencies
    WHERE id = v_denom.currency_id AND issuer_authority_id = p_authority_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La autoridad no es emisora de esta moneda'; END IF;
  IF COALESCE(v_currency.pdh_reserves, 0) <= 0 THEN RAISE EXCEPTION 'No hay respaldo de emisión suficiente'; END IF;

  v_amount := v_denom.value * 432 * p_boxes;
  v_circulation := GREATEST(0, v_currency.printed_amount - v_currency.burned_amount + v_amount);
  UPDATE public.currencies SET printed_amount = printed_amount + v_amount,
    exchange_rate_to_pdh = CASE WHEN is_fixed_rate THEN exchange_rate_to_pdh ELSE pdh_reserves / NULLIF(v_circulation, 0) END,
    updated_at = now() WHERE id = v_currency.id;
  UPDATE public.monetary_authority_denominations
    SET boxes_printed = boxes_printed + p_boxes, updated_at = now() WHERE id = v_denom.id;
END; $$;

REVOKE ALL ON FUNCTION public.print_authority_banknote_boxes(text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.print_authority_banknote_boxes(text,text,integer) TO authenticated;
