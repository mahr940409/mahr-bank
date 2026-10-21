CREATE OR REPLACE FUNCTION public.present_personal_cheque(p_cheque_id text, p_paying_bank_id text)
RETURNS public.cheques
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cheque public.cheques;
  v_balance numeric;
BEGIN
  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cheque no encontrado'; END IF;
  IF v_cheque.cheque_type <> 'personal' THEN RAISE EXCEPTION 'Solo se pueden presentar cheques personales'; END IF;
  IF v_cheque.status <> 'issued' THEN RAISE EXCEPTION 'El cheque no está disponible para cobro'; END IF;
  IF v_cheque.issuer_account_id IS NULL THEN RAISE EXCEPTION 'Cheque sin cuenta emisora'; END IF;

  SELECT balance_pdh INTO v_balance FROM public.accounts
  WHERE id = v_cheque.issuer_account_id FOR UPDATE;
  IF NOT FOUND OR v_balance < v_cheque.amount THEN
    UPDATE public.cheques SET status = 'rejected', presented_at = now() WHERE id = v_cheque.id;
    RAISE EXCEPTION 'Cheque rechazado: saldo insuficiente';
  END IF;

  UPDATE public.accounts SET balance_pdh = balance_pdh - v_cheque.amount, updated_at = now()
  WHERE id = v_cheque.issuer_account_id;
  UPDATE public.cheques SET status = 'paid', presented_at = now(), paid_at = now(), frozen_amount = 0
  WHERE id = v_cheque.id
  RETURNING * INTO v_cheque;
  RETURN v_cheque;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_promissory_note(p_note_id text)
RETURNS public.promissory_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note public.promissory_notes;
  v_balance numeric;
BEGIN
  SELECT * INTO v_note FROM public.promissory_notes WHERE id = p_note_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagaré no encontrado'; END IF;
  IF v_note.status NOT IN ('issued', 'accepted') THEN RAISE EXCEPTION 'El pagaré no está pendiente de pago'; END IF;
  IF v_note.issuer_account_id IS NULL THEN RAISE EXCEPTION 'Pagaré sin cuenta emisora'; END IF;

  SELECT balance_pdh INTO v_balance FROM public.accounts
  WHERE id = v_note.issuer_account_id FOR UPDATE;
  IF NOT FOUND OR v_balance < v_note.outstanding THEN
    UPDATE public.promissory_notes SET status = 'defaulted' WHERE id = v_note.id;
    RAISE EXCEPTION 'Pagaré incumplido: saldo insuficiente';
  END IF;

  UPDATE public.accounts SET balance_pdh = balance_pdh - v_note.outstanding, updated_at = now()
  WHERE id = v_note.issuer_account_id;
  UPDATE public.promissory_notes SET status = 'paid', outstanding = 0, paid_at = now()
  WHERE id = v_note.id
  RETURNING * INTO v_note;
  RETURN v_note;
END;
$$;

REVOKE ALL ON FUNCTION public.present_personal_cheque(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_promissory_note(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.present_personal_cheque(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_promissory_note(text) TO authenticated;


-- Bank cheques reserve money at issuance. The reserve is released on cancellation
-- and consumed when the cheque is presented.
ALTER TABLE public.national_bank_accounts
  ADD COLUMN IF NOT EXISTS balance_frozen numeric NOT NULL DEFAULT 0;

ALTER TABLE public.private_bank_accounts
  ADD COLUMN IF NOT EXISTS balance_frozen numeric NOT NULL DEFAULT 0;

ALTER TABLE public.bank_main_account
  ADD COLUMN IF NOT EXISTS balance_frozen_pdh numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'national_bank_accounts_frozen_lte_real') THEN
    ALTER TABLE public.national_bank_accounts ADD CONSTRAINT national_bank_accounts_frozen_lte_real CHECK (balance_frozen <= balance_real);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'private_bank_accounts_frozen_lte_real') THEN
    ALTER TABLE public.private_bank_accounts ADD CONSTRAINT private_bank_accounts_frozen_lte_real CHECK (balance_frozen <= balance_real);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_main_account_frozen_lte_pdh') THEN
    ALTER TABLE public.bank_main_account ADD CONSTRAINT bank_main_account_frozen_lte_pdh CHECK (balance_frozen_pdh <= balance_pdh);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.issue_bank_cheque(
  p_issuer_bank_type text,
  p_issuer_bank_id text,
  p_issuer_account_id text,
  p_payee_name text,
  p_payee_account_id text,
  p_currency_iso text,
  p_amount numeric,
  p_memo text DEFAULT NULL
)
RETURNS public.cheques
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cheque public.cheques;
  v_available numeric;
  v_source_currency text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  IF p_issuer_bank_type NOT IN ('national', 'private', 'mahr') THEN RAISE EXCEPTION 'Banco emisor inválido'; END IF;

  IF p_issuer_bank_type = 'mahr' THEN
    IF p_currency_iso <> 'PDH' OR p_issuer_account_id <> 'bank-main' THEN
      RAISE EXCEPTION 'La cuenta MAHR solo emite cheques en PDH';
    END IF;
    SELECT balance_pdh - balance_frozen_pdh INTO v_available
      FROM public.bank_main_account WHERE id = 'bank-main' FOR UPDATE;
    IF v_available IS NULL OR v_available < p_amount THEN RAISE EXCEPTION 'Saldo disponible insuficiente'; END IF;
    UPDATE public.bank_main_account SET balance_frozen_pdh = balance_frozen_pdh + p_amount WHERE id = 'bank-main';
  ELSIF p_issuer_bank_type = 'national' THEN
    SELECT a.balance_real - a.balance_frozen, c.iso_code INTO v_available, v_source_currency
      FROM public.national_bank_accounts a
      JOIN public.national_banks nb ON nb.id = a.national_bank_id
      JOIN public.countries co ON co.id = nb.country_id
      JOIN public.currencies c ON c.id = co.currency_id
      WHERE a.id = p_issuer_account_id AND a.national_bank_id = p_issuer_bank_id FOR UPDATE;
    IF v_source_currency <> p_currency_iso THEN RAISE EXCEPTION 'La moneda no coincide con la cuenta emisora'; END IF;
    IF v_available IS NULL OR v_available < p_amount THEN RAISE EXCEPTION 'Saldo disponible insuficiente'; END IF;
    UPDATE public.national_bank_accounts SET balance_frozen = balance_frozen + p_amount WHERE id = p_issuer_account_id;
  ELSE
    SELECT a.balance_real - a.balance_frozen, c.iso_code INTO v_available, v_source_currency
      FROM public.private_bank_accounts a
      JOIN public.private_banks pb ON pb.id = a.private_bank_id
      JOIN public.countries co ON co.id = pb.country_id
      JOIN public.currencies c ON c.id = co.currency_id
      WHERE a.id = p_issuer_account_id AND a.private_bank_id = p_issuer_bank_id FOR UPDATE;
    IF v_source_currency <> p_currency_iso THEN RAISE EXCEPTION 'La moneda no coincide con la cuenta emisora'; END IF;
    IF v_available IS NULL OR v_available < p_amount THEN RAISE EXCEPTION 'Saldo disponible insuficiente'; END IF;
    UPDATE public.private_bank_accounts SET balance_frozen = balance_frozen + p_amount WHERE id = p_issuer_account_id;
  END IF;

  INSERT INTO public.cheques (cheque_type, issuer_account_id, issuer_bank_type, issuer_bank_id,
    payee_name, payee_account_id, currency_iso, amount, frozen_amount, memo)
  VALUES ('bank', p_issuer_account_id, p_issuer_bank_type, p_issuer_bank_id,
    trim(p_payee_name), p_payee_account_id, p_currency_iso, p_amount, p_amount, p_memo)
  RETURNING * INTO v_cheque;
  RETURN v_cheque;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_bank_cheque(p_cheque_id text)
RETURNS public.cheques
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cheque public.cheques; v_result public.cheques;
BEGIN
  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id FOR UPDATE;
  IF v_cheque.id IS NULL OR v_cheque.cheque_type <> 'bank' THEN RAISE EXCEPTION 'Cheque bancario no encontrado'; END IF;
  IF v_cheque.status <> 'issued' THEN RAISE EXCEPTION 'El cheque ya no está vigente'; END IF;
  IF v_cheque.issuer_bank_type = 'mahr' THEN
    UPDATE public.bank_main_account SET balance_frozen_pdh = GREATEST(0, balance_frozen_pdh - v_cheque.frozen_amount) WHERE id = 'bank-main';
  ELSIF v_cheque.issuer_bank_type = 'national' THEN
    UPDATE public.national_bank_accounts SET balance_frozen = GREATEST(0, balance_frozen - v_cheque.frozen_amount) WHERE id = v_cheque.issuer_account_id AND national_bank_id = v_cheque.issuer_bank_id;
  ELSE
    UPDATE public.private_bank_accounts SET balance_frozen = GREATEST(0, balance_frozen - v_cheque.frozen_amount) WHERE id = v_cheque.issuer_account_id AND private_bank_id = v_cheque.issuer_bank_id;
  END IF;
  UPDATE public.cheques SET status = 'cancelled', frozen_amount = 0 WHERE id = v_cheque.id RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.present_bank_cheque(p_cheque_id text)
RETURNS public.cheques
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cheque public.cheques; v_result public.cheques;
BEGIN
  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id FOR UPDATE;
  IF v_cheque.id IS NULL OR v_cheque.cheque_type <> 'bank' THEN RAISE EXCEPTION 'Cheque bancario no encontrado'; END IF;
  IF v_cheque.status <> 'issued' THEN RAISE EXCEPTION 'El cheque ya no está vigente'; END IF;
  IF v_cheque.issuer_bank_type = 'mahr' THEN
    UPDATE public.bank_main_account SET balance_pdh = balance_pdh - v_cheque.amount, balance_frozen_pdh = balance_frozen_pdh - v_cheque.frozen_amount WHERE id = 'bank-main';
  ELSIF v_cheque.issuer_bank_type = 'national' THEN
    UPDATE public.national_bank_accounts SET balance_real = balance_real - v_cheque.amount, balance_frozen = balance_frozen - v_cheque.frozen_amount WHERE id = v_cheque.issuer_account_id AND national_bank_id = v_cheque.issuer_bank_id;
  ELSE
    UPDATE public.private_bank_accounts SET balance_real = balance_real - v_cheque.amount, balance_frozen = balance_frozen - v_cheque.frozen_amount WHERE id = v_cheque.issuer_account_id AND private_bank_id = v_cheque.issuer_bank_id;
  END IF;
  UPDATE public.cheques SET status = 'paid', presented_at = now(), paid_at = now(), frozen_amount = 0 WHERE id = v_cheque.id RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_bank_cheque(text,text,text,text,text,text,numeric,text), public.cancel_bank_cheque(text), public.present_bank_cheque(text) TO authenticated;


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
  INSERT INTO public.transactions (id, transaction_type, from_account_id, to_account_id, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8),
      'transfer', v_cheque.issuer_account_id, v_cheque.payee_account_id, v_cheque.amount, v_cheque.currency_iso,
      'Cobro de cheque bancario ' || v_cheque.cheque_number);
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
  INSERT INTO public.transactions (id, transaction_type, from_account_id, to_account_id, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8),
      'transfer', v_cheque.issuer_account_id, v_cheque.payee_account_id, v_cheque.amount, v_cheque.currency_iso,
      'Cobro de cheque personal ' || v_cheque.cheque_number);
  UPDATE public.cheques SET status = 'paid', presented_at = now(), paid_at = now() WHERE id = v_cheque.id RETURNING * INTO v_cheque;
  RETURN v_cheque;
END; $$;

REVOKE ALL ON FUNCTION public.present_personal_cheque(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.present_personal_cheque(text,text) TO authenticated;


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
