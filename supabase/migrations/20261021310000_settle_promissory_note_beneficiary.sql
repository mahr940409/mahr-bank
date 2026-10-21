CREATE OR REPLACE FUNCTION public.pay_promissory_note(p_note_id text)
RETURNS public.promissory_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_note public.promissory_notes; v_issuer public.accounts; v_beneficiary public.accounts;
  v_column text; v_available numeric;
BEGIN
  SELECT * INTO v_note FROM public.promissory_notes WHERE id = p_note_id FOR UPDATE;
  IF v_note.id IS NULL THEN RAISE EXCEPTION 'Pagaré no encontrado'; END IF;
  IF v_note.status NOT IN ('issued','accepted') THEN RAISE EXCEPTION 'El pagaré no está pendiente de pago'; END IF;
  SELECT * INTO v_issuer FROM public.accounts WHERE id = v_note.issuer_account_id FOR UPDATE;
  IF v_issuer.id IS NULL THEN RAISE EXCEPTION 'Cuenta emisora no encontrada'; END IF;
  IF COALESCE(v_issuer.currency, 'PDH') <> v_note.currency_iso THEN RAISE EXCEPTION 'La moneda no coincide con la cuenta emisora'; END IF;
  v_column := CASE v_note.currency_iso WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  EXECUTE format('SELECT %I FROM public.accounts WHERE id = $1', v_column) INTO v_available USING v_issuer.id;
  IF COALESCE(v_available, 0) < v_note.outstanding THEN
    UPDATE public.promissory_notes SET status = 'defaulted' WHERE id = v_note.id;
    RAISE EXCEPTION 'Pagaré incumplido: saldo insuficiente';
  END IF;
  IF v_note.beneficiary_account_id IS NOT NULL THEN
    SELECT * INTO v_beneficiary FROM public.accounts WHERE id = v_note.beneficiary_account_id FOR UPDATE;
    IF v_beneficiary.id IS NULL THEN RAISE EXCEPTION 'Cuenta beneficiaria no encontrada'; END IF;
    IF COALESCE(v_beneficiary.currency, 'PDH') <> v_note.currency_iso THEN RAISE EXCEPTION 'La moneda no coincide con la cuenta beneficiaria'; END IF;
  END IF;
  EXECUTE format('UPDATE public.accounts SET %I = %I - $1, updated_at = now() WHERE id = $2', v_column, v_column) USING v_note.outstanding, v_issuer.id;
  IF v_note.beneficiary_account_id IS NOT NULL THEN
    EXECUTE format('UPDATE public.accounts SET %I = %I + $1, updated_at = now() WHERE id = $2', v_column, v_column) USING v_note.outstanding, v_beneficiary.id;
  END IF;
  INSERT INTO public.transactions (id, transaction_type, from_account_id, to_account_id, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'transfer',
      v_note.issuer_account_id, v_note.beneficiary_account_id, v_note.outstanding, v_note.currency_iso,
      'Pago de pagaré ' || v_note.note_number);
  UPDATE public.promissory_notes SET status = 'paid', outstanding = 0, paid_at = now() WHERE id = v_note.id RETURNING * INTO v_note;
  RETURN v_note;
END; $$;

REVOKE ALL ON FUNCTION public.pay_promissory_note(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_promissory_note(text) TO authenticated;
