CREATE OR REPLACE FUNCTION public.transfer_private_accounts_atomic(
  p_bank_id text,
  p_from_account_id text,
  p_to_account_id text,
  p_amount numeric,
  p_currency_iso text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from public.private_bank_accounts;
  v_to public.private_bank_accounts;
  v_main public.private_bank_accounts;
  v_bank public.private_banks;
  v_fee numeric;
  v_net numeric;
  v_sym numeric;
  v_real numeric;
BEGIN
  IF p_amount <= 0 OR p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Traspaso inválido'; END IF;
  SELECT * INTO v_bank FROM public.private_banks WHERE id = p_bank_id AND status = 'active' FOR UPDATE;
  IF v_bank.id IS NULL THEN RAISE EXCEPTION 'Banco privado no encontrado'; END IF;
  SELECT * INTO v_from FROM public.private_bank_accounts WHERE id = p_from_account_id AND private_bank_id = p_bank_id FOR UPDATE;
  SELECT * INTO v_to FROM public.private_bank_accounts WHERE id = p_to_account_id AND private_bank_id = p_bank_id FOR UPDATE;
  IF v_from.id IS NULL OR v_to.id IS NULL THEN RAISE EXCEPTION 'Cuenta privada no encontrada'; END IF;
  IF COALESCE(v_from.balance_real, 0) + COALESCE(v_from.balance_symbolic, 0) < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  v_fee := p_amount * COALESCE(v_bank.fee_transfer, 0) / 100;
  v_net := p_amount - v_fee;
  v_sym := LEAST(COALESCE(v_from.balance_symbolic, 0), p_amount);
  v_real := p_amount - v_sym;

  UPDATE public.private_bank_accounts
  SET balance_real = balance_real - v_real,
      balance_symbolic = balance_symbolic - v_sym,
      updated_at = now()
  WHERE id = v_from.id;
  UPDATE public.private_bank_accounts
  SET balance_real = balance_real + v_net * CASE WHEN p_amount = 0 THEN 0 ELSE v_real / p_amount END,
      balance_symbolic = balance_symbolic + v_net * CASE WHEN p_amount = 0 THEN 0 ELSE v_sym / p_amount END,
      updated_at = now()
  WHERE id = v_to.id;

  IF v_fee > 0 THEN
    SELECT * INTO v_main FROM public.private_bank_accounts WHERE private_bank_id = p_bank_id AND type = 'main' FOR UPDATE;
    IF v_main.id IS NULL THEN RAISE EXCEPTION 'Cuenta principal del banco no encontrada'; END IF;
    UPDATE public.private_bank_accounts SET balance_real = balance_real + v_fee, updated_at = now() WHERE id = v_main.id;
  END IF;
  INSERT INTO public.private_bank_transactions
    (private_bank_id, type, from_account_id, to_account_id, amount, fee, money_source, currency_iso, description)
  VALUES (p_bank_id, 'transfer', v_from.id, v_to.id, v_net, v_fee,
    CASE WHEN v_sym > 0 THEN 'symbolic' ELSE 'printed' END, p_currency_iso, 'Traspaso interno atómico');
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_private_accounts_atomic(text,text,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_private_accounts_atomic(text,text,text,numeric,text) TO authenticated;
