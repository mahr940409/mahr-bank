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
