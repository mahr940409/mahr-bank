CREATE OR REPLACE FUNCTION public.withdraw_private_account_atomic(
  p_bank_id text, p_account_id text, p_amount numeric, p_fee numeric,
  p_currency_iso text, p_real_part numeric, p_symbolic_part numeric,
  p_backing_currency text DEFAULT NULL, p_backing_units numeric DEFAULT 0,
  p_destination_account_id text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bank public.private_banks; v_account public.private_bank_accounts; v_main public.private_bank_accounts;
  v_available numeric; v_cash numeric;
BEGIN
  IF p_amount <= 0 OR p_real_part < 0 OR p_symbolic_part < 0 OR abs(p_real_part + p_symbolic_part - p_amount) > 0.000001 THEN RAISE EXCEPTION 'Importe de retiro inválido'; END IF;
  SELECT * INTO v_bank FROM public.private_banks WHERE id = p_bank_id AND status = 'active' FOR UPDATE;
  SELECT * INTO v_account FROM public.private_bank_accounts WHERE id = p_account_id AND private_bank_id = p_bank_id FOR UPDATE;
  IF v_bank.id IS NULL OR v_account.id IS NULL THEN RAISE EXCEPTION 'Banco o cuenta privada no encontrada'; END IF;
  v_available := COALESCE(v_account.balance_real, 0) - COALESCE(v_account.balance_frozen, 0);
  IF v_available < p_real_part OR COALESCE(v_account.balance_symbolic, 0) < p_symbolic_part THEN RAISE EXCEPTION 'Saldo disponible insuficiente'; END IF;
  v_cash := COALESCE(v_bank.cash_on_hand, 0);
  IF v_cash < p_amount - p_fee THEN RAISE EXCEPTION 'Efectivo insuficiente en la bóveda'; END IF;
  UPDATE public.private_bank_accounts SET balance_real = balance_real - p_real_part, balance_symbolic = balance_symbolic - p_symbolic_part,
    symbolic_backing_currency = CASE WHEN balance_symbolic - p_symbolic_part <= 0 THEN NULL ELSE symbolic_backing_currency END, updated_at = now() WHERE id = v_account.id;
  UPDATE public.private_banks SET cash_on_hand = v_cash - (p_amount - p_fee), updated_at = now() WHERE id = v_bank.id;
  IF p_symbolic_part > 0 THEN
    IF p_backing_currency IS NULL OR p_backing_units <= 0 THEN RAISE EXCEPTION 'Falta información del respaldo simbólico'; END IF;
    UPDATE public.bank_backings SET amount = amount + p_backing_units, updated_at = now()
      WHERE bank_type = 'private' AND bank_id = p_bank_id AND currency_iso = p_backing_currency;
    IF NOT FOUND THEN
      INSERT INTO public.bank_backings (bank_type, bank_id, currency_iso, amount, frozen) VALUES ('private', p_bank_id, p_backing_currency, p_backing_units, 0);
    END IF;
  END IF;
  IF p_fee > 0 THEN
    SELECT * INTO v_main FROM public.private_bank_accounts WHERE private_bank_id = p_bank_id AND type = 'main' FOR UPDATE;
    IF v_main.id IS NULL THEN RAISE EXCEPTION 'Cuenta principal privada no encontrada'; END IF;
    UPDATE public.private_bank_accounts SET balance_real = balance_real + p_fee, updated_at = now() WHERE id = v_main.id;
  END IF;
  INSERT INTO public.private_bank_transactions (private_bank_id, type, from_account_id, to_account_id, amount, fee, money_source, currency_iso, description)
    VALUES (p_bank_id, 'withdrawal', p_account_id, p_destination_account_id, p_amount, p_fee,
      CASE WHEN p_symbolic_part > 0 THEN 'symbolic' ELSE 'printed' END, p_currency_iso, 'Retiro atómico');
END; $$;

REVOKE ALL ON FUNCTION public.withdraw_private_account_atomic(text,text,numeric,numeric,text,numeric,numeric,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_private_account_atomic(text,text,numeric,numeric,text,numeric,numeric,text,numeric,text) TO authenticated;
