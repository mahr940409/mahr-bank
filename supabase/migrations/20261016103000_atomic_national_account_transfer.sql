CREATE OR REPLACE FUNCTION public.transfer_national_accounts(
  p_bank_id text,
  p_from_account_id text,
  p_to_account_id text,
  p_amount numeric,
  p_currency_iso text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_from public.national_bank_accounts%ROWTYPE;
  v_to public.national_bank_accounts%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor que cero';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Las cuentas deben ser diferentes';
  END IF;

  SELECT * INTO v_from
  FROM public.national_bank_accounts
  WHERE id = p_from_account_id AND national_bank_id = p_bank_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta origen no pertenece al banco'; END IF;

  SELECT * INTO v_to
  FROM public.national_bank_accounts
  WHERE id = p_to_account_id AND national_bank_id = p_bank_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta destino no pertenece al banco'; END IF;
  IF v_from.status <> 'active' OR v_to.status <> 'active' THEN
    RAISE EXCEPTION 'Las cuentas deben estar activas';
  END IF;
  IF v_from.balance_real < p_amount THEN
    RAISE EXCEPTION 'Saldo real insuficiente';
  END IF;

  UPDATE public.national_bank_accounts
  SET balance_real = balance_real - p_amount, updated_at = now()
  WHERE id = v_from.id;
  UPDATE public.national_bank_accounts
  SET balance_real = balance_real + p_amount, updated_at = now()
  WHERE id = v_to.id;

  INSERT INTO public.national_bank_transactions (
    national_bank_id, transaction_type, from_account_id, to_account_id,
    amount_local, currency_local, is_symbolic, description, status
  ) VALUES (
    p_bank_id, 'national_transfer', v_from.id, v_to.id,
    p_amount, p_currency_iso, false,
    'Transferencia nacional atómica', 'executed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_national_accounts(text, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_national_accounts(text, text, text, numeric, text) TO authenticated;
