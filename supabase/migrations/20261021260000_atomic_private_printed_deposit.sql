CREATE OR REPLACE FUNCTION public.deposit_private_printed_atomic(
  p_bank_id text,
  p_source_national_account_id text,
  p_target_account_id text,
  p_amount numeric,
  p_net numeric,
  p_fee numeric,
  p_currency_iso text,
  p_denomination_breakdown jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source public.national_bank_accounts;
  v_target public.private_bank_accounts;
  v_bank public.private_banks;
  v_main public.private_bank_accounts;
  v_item record;
  v_denom public.banknote_denominations;
  v_custody integer;
  v_count integer;
BEGIN
  IF p_amount <= 0 OR p_net <= 0 OR p_fee < 0 THEN RAISE EXCEPTION 'Importes inválidos'; END IF;
  SELECT * INTO v_bank FROM public.private_banks WHERE id = p_bank_id AND status = 'active' FOR UPDATE;
  SELECT * INTO v_source FROM public.national_bank_accounts WHERE id = p_source_national_account_id FOR UPDATE;
  SELECT * INTO v_target FROM public.private_bank_accounts WHERE id = p_target_account_id AND private_bank_id = p_bank_id FOR UPDATE;
  IF v_bank.id IS NULL OR v_source.id IS NULL OR v_target.id IS NULL THEN RAISE EXCEPTION 'Cuenta o banco no encontrado'; END IF;
  IF v_source.balance_real < p_amount THEN RAISE EXCEPTION 'Saldo real insuficiente en la cuenta nacional'; END IF;

  FOR v_item IN SELECT key, value FROM jsonb_each_text(COALESCE(p_denomination_breakdown, '{}'::jsonb)) LOOP
    v_count := floor(v_item.value::numeric);
    IF v_count <= 0 THEN RAISE EXCEPTION 'Cantidad de billetes inválida'; END IF;
    SELECT d.* INTO v_denom FROM public.banknote_denominations d
      WHERE d.national_bank_id = v_source.national_bank_id
        AND d.currency_iso = p_currency_iso
        AND abs(d.value - v_item.key::numeric) < 0.000001;
    IF v_denom.id IS NULL THEN RAISE EXCEPTION 'Denominación no emitida por el Banco Nacional'; END IF;
    v_custody := 0;
    SELECT COALESCE(quantity, 0) INTO v_custody FROM public.banknote_custody
      WHERE bank_type = 'national' AND bank_id = v_source.national_bank_id AND denomination_id = v_denom.id FOR UPDATE;
    IF v_custody < v_count THEN RAISE EXCEPTION 'Billetes insuficientes en la custodia nacional'; END IF;
    UPDATE public.banknote_custody SET quantity = quantity - v_count, updated_at = now()
      WHERE bank_type = 'national' AND bank_id = v_source.national_bank_id AND denomination_id = v_denom.id;
    INSERT INTO public.banknote_custody (bank_type, bank_id, denomination_id, quantity)
      VALUES ('private', p_bank_id, v_denom.id, v_count)
      ON CONFLICT (bank_type, bank_id, denomination_id)
      DO UPDATE SET quantity = public.banknote_custody.quantity + EXCLUDED.quantity, updated_at = now();
  END LOOP;

  UPDATE public.national_bank_accounts SET balance_real = balance_real - p_amount, updated_at = now() WHERE id = v_source.id;
  UPDATE public.private_bank_accounts SET balance_real = balance_real + p_net, updated_at = now() WHERE id = v_target.id;
  IF p_fee > 0 THEN
    SELECT * INTO v_main FROM public.private_bank_accounts WHERE private_bank_id = p_bank_id AND type = 'main' FOR UPDATE;
    IF v_main.id IS NULL THEN RAISE EXCEPTION 'Cuenta principal privada no encontrada'; END IF;
    UPDATE public.private_bank_accounts SET balance_real = balance_real + p_fee, updated_at = now() WHERE id = v_main.id;
  END IF;
  INSERT INTO public.private_bank_transactions
    (private_bank_id, type, from_account_id, to_account_id, amount, fee, money_source, currency_iso, denomination_breakdown, description)
  VALUES (p_bank_id, 'deposit', p_source_national_account_id, p_target_account_id, p_net, p_fee, 'printed', p_currency_iso,
    COALESCE(p_denomination_breakdown, '{}'::jsonb), 'Depósito impreso atómico');
END;
$$;

REVOKE ALL ON FUNCTION public.deposit_private_printed_atomic(text,text,text,numeric,numeric,numeric,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_private_printed_atomic(text,text,text,numeric,numeric,numeric,text,jsonb) TO authenticated;
