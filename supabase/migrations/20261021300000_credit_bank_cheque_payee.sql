CREATE OR REPLACE FUNCTION public.present_bank_cheque(p_cheque_id text)
RETURNS public.cheques LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cheque public.cheques; v_result public.cheques; v_payee public.accounts;
  v_column text;
BEGIN
  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id FOR UPDATE;
  IF v_cheque.id IS NULL OR v_cheque.cheque_type <> 'bank' THEN RAISE EXCEPTION 'Cheque bancario no encontrado'; END IF;
  IF v_cheque.status <> 'issued' THEN RAISE EXCEPTION 'El cheque ya no está vigente'; END IF;
  IF v_cheque.payee_account_id IS NOT NULL THEN
    SELECT * INTO v_payee FROM public.accounts WHERE id = v_cheque.payee_account_id FOR UPDATE;
    IF v_payee.id IS NULL THEN RAISE EXCEPTION 'Cuenta beneficiaria no encontrada'; END IF;
    IF COALESCE(v_payee.currency, 'PDH') <> v_cheque.currency_iso THEN RAISE EXCEPTION 'La moneda del cheque no coincide con la cuenta beneficiaria'; END IF;
    v_column := CASE v_cheque.currency_iso WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  END IF;
  IF v_cheque.issuer_bank_type = 'mahr' THEN
    UPDATE public.bank_main_account SET balance_pdh = balance_pdh - v_cheque.amount,
      balance_frozen_pdh = balance_frozen_pdh - v_cheque.frozen_amount WHERE id = 'bank-main';
  ELSIF v_cheque.issuer_bank_type = 'national' THEN
    UPDATE public.national_bank_accounts SET balance_real = balance_real - v_cheque.amount,
      balance_frozen = balance_frozen - v_cheque.frozen_amount
      WHERE id = v_cheque.issuer_account_id AND national_bank_id = v_cheque.issuer_bank_id;
  ELSE
    UPDATE public.private_bank_accounts SET balance_real = balance_real - v_cheque.amount,
      balance_frozen = balance_frozen - v_cheque.frozen_amount
      WHERE id = v_cheque.issuer_account_id AND private_bank_id = v_cheque.issuer_bank_id;
  END IF;
  IF v_cheque.payee_account_id IS NOT NULL THEN
    EXECUTE format('UPDATE public.accounts SET %I = %I + $1, updated_at = now() WHERE id = $2', v_column, v_column)
      USING v_cheque.amount, v_payee.id;
  END IF;
  UPDATE public.cheques SET status = 'paid', presented_at = now(), paid_at = now(), frozen_amount = 0
    WHERE id = v_cheque.id RETURNING * INTO v_result;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.present_bank_cheque(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.present_bank_cheque(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.present_personal_cheque(p_cheque_id text, p_paying_bank_id text)
RETURNS public.cheques LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cheque public.cheques; v_issuer public.accounts; v_payee public.accounts; v_column text; v_available numeric;
BEGIN
  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id FOR UPDATE;
  IF v_cheque.id IS NULL OR v_cheque.cheque_type <> 'personal' THEN RAISE EXCEPTION 'Cheque personal no encontrado'; END IF;
  IF v_cheque.status <> 'issued' THEN RAISE EXCEPTION 'El cheque no está disponible para cobro'; END IF;
  SELECT * INTO v_issuer FROM public.accounts WHERE id = v_cheque.issuer_account_id FOR UPDATE;
  IF v_issuer.id IS NULL THEN RAISE EXCEPTION 'Cuenta emisora no encontrada'; END IF;
  IF COALESCE(v_issuer.currency, 'PDH') <> v_cheque.currency_iso THEN RAISE EXCEPTION 'La moneda del cheque no coincide con la cuenta emisora'; END IF;
  v_column := CASE v_cheque.currency_iso WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  EXECUTE format('SELECT %I FROM public.accounts WHERE id = $1', v_column) INTO v_available USING v_issuer.id;
  IF COALESCE(v_available, 0) < v_cheque.amount THEN
    UPDATE public.cheques SET status = 'rejected', presented_at = now() WHERE id = v_cheque.id;
    RAISE EXCEPTION 'Cheque rechazado: saldo insuficiente';
  END IF;
  EXECUTE format('UPDATE public.accounts SET %I = %I - $1, updated_at = now() WHERE id = $2', v_column, v_column) USING v_cheque.amount, v_issuer.id;
  IF v_cheque.payee_account_id IS NOT NULL THEN
    SELECT * INTO v_payee FROM public.accounts WHERE id = v_cheque.payee_account_id FOR UPDATE;
    IF v_payee.id IS NULL THEN RAISE EXCEPTION 'Cuenta beneficiaria no encontrada'; END IF;
    IF COALESCE(v_payee.currency, 'PDH') <> v_cheque.currency_iso THEN RAISE EXCEPTION 'La moneda no coincide con la cuenta beneficiaria'; END IF;
    EXECUTE format('UPDATE public.accounts SET %I = %I + $1, updated_at = now() WHERE id = $2', v_column, v_column) USING v_cheque.amount, v_payee.id;
  END IF;
  UPDATE public.cheques SET status = 'paid', presented_at = now(), paid_at = now() WHERE id = v_cheque.id RETURNING * INTO v_cheque;
  RETURN v_cheque;
END; $$;

REVOKE ALL ON FUNCTION public.present_personal_cheque(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.present_personal_cheque(text,text) TO authenticated;
