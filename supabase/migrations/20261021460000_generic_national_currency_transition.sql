-- Generic monetary transition for a country that moves from an adopted
-- currency to its own currency. No country or currency is created here.
CREATE TABLE IF NOT EXISTS public.national_bank_foreign_cash (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  national_bank_id text NOT NULL REFERENCES public.national_banks(id) ON DELETE CASCADE,
  currency_iso text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  source text NOT NULL DEFAULT 'currency_transition',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (national_bank_id, currency_iso, source)
);

ALTER TABLE public.national_bank_foreign_cash ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage national foreign cash" ON public.national_bank_foreign_cash;
CREATE POLICY "Authenticated users can manage national foreign cash"
  ON public.national_bank_foreign_cash FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.national_bank_foreign_cash TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_national_currency(
  p_country_id text,
  p_new_currency_id text,
  p_old_units_per_new_unit numeric
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_bank public.national_banks%ROWTYPE;
  v_country public.countries%ROWTYPE;
  v_old_currency public.currencies%ROWTYPE;
  v_new_currency public.currencies%ROWTYPE;
  v_old_iso text;
  v_new_iso text;
  v_treasury public.national_bank_accounts%ROWTYPE;
BEGIN
  IF p_old_units_per_new_unit IS NULL OR p_old_units_per_new_unit <= 0 THEN
    RAISE EXCEPTION 'La tasa debe ser mayor que cero';
  END IF;

  SELECT * INTO v_country FROM public.countries WHERE id = p_country_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'País inexistente'; END IF;
  SELECT * INTO v_bank FROM public.national_banks WHERE country_id = p_country_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El país no tiene banco nacional'; END IF;
  SELECT * INTO v_old_currency FROM public.currencies WHERE id = v_country.currency_id;
  SELECT * INTO v_new_currency FROM public.currencies WHERE id = p_new_currency_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La nueva moneda no existe'; END IF;
  IF v_country.currency_id = p_new_currency_id THEN RAISE EXCEPTION 'La moneda nueva debe ser diferente'; END IF;
  v_old_iso := v_old_currency.iso_symbol;
  v_new_iso := v_new_currency.iso_symbol;

  -- Physical notes in the adopted currency remain foreign cash in the vault.
  SELECT * INTO v_treasury FROM public.national_bank_accounts
    WHERE national_bank_id = v_bank.id AND account_type = 'bank_treasury' FOR UPDATE;
  IF FOUND AND v_treasury.balance_real > 0 THEN
    INSERT INTO public.national_bank_foreign_cash (national_bank_id, currency_iso, amount)
    VALUES (v_bank.id, v_old_iso, v_treasury.balance_real)
    ON CONFLICT (national_bank_id, currency_iso, source)
    DO UPDATE SET amount = national_bank_foreign_cash.amount + EXCLUDED.amount, updated_at = now();
    UPDATE public.national_bank_accounts SET balance_real = 0, updated_at = now() WHERE id = v_treasury.id;
  END IF;

  -- Customer balances and symbolic obligations become balances in the new
  -- local currency. Their MAHR international backing is intentionally left
  -- untouched and keeps its original backing currency.
  UPDATE public.national_bank_accounts
  SET balance_real = balance_real * p_old_units_per_new_unit,
      balance_symbolic = balance_symbolic * p_old_units_per_new_unit,
      balance_frozen = balance_frozen * p_old_units_per_new_unit,
      updated_at = now()
  WHERE national_bank_id = v_bank.id AND account_type <> 'bank_treasury';

  UPDATE public.countries
  SET currency_id = p_new_currency_id, can_issue_currency = true, updated_at = now()
  WHERE id = p_country_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_national_currency(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_national_currency(text, text, numeric) TO authenticated;
