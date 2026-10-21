-- Bank cheques reserve money at issuance. The reserve is released on cancellation
-- and consumed when the cheque is presented.
ALTER TABLE public.national_bank_accounts
  ADD COLUMN IF NOT EXISTS balance_frozen numeric NOT NULL DEFAULT 0;

ALTER TABLE public.private_bank_accounts
  ADD COLUMN IF NOT EXISTS balance_frozen numeric NOT NULL DEFAULT 0;

ALTER TABLE public.bank_main_account
  ADD COLUMN IF NOT EXISTS balance_frozen_pdh numeric NOT NULL DEFAULT 0;

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
    SELECT balance_real - balance_frozen INTO v_available
      FROM public.national_bank_accounts WHERE id = p_issuer_account_id AND national_bank_id = p_issuer_bank_id FOR UPDATE;
    IF v_available IS NULL OR v_available < p_amount THEN RAISE EXCEPTION 'Saldo disponible insuficiente'; END IF;
    UPDATE public.national_bank_accounts SET balance_frozen = balance_frozen + p_amount WHERE id = p_issuer_account_id;
  ELSE
    SELECT balance_real - balance_frozen INTO v_available
      FROM public.private_bank_accounts WHERE id = p_issuer_account_id AND private_bank_id = p_issuer_bank_id FOR UPDATE;
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
