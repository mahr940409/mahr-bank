CREATE OR REPLACE FUNCTION public.pay_loan_extra_atomic(p_loan_id text, p_amount numeric, p_currency text DEFAULT 'PDH')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_loan public.loans; v_account public.accounts; v_payment record;
  v_column text; v_balance numeric; v_new numeric; v_rate numeric := 1; v_weekly_rate numeric;
  v_weeks integer; v_payment_amount numeric; v_remaining numeric; v_interest numeric; v_principal numeric;
BEGIN
  IF p_amount <= 0 OR upper(p_currency) NOT IN ('PDH','BDH','LDH') THEN RAISE EXCEPTION 'Abono inválido'; END IF;
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  SELECT * INTO v_account FROM public.accounts WHERE id = v_loan.account_id FOR UPDATE;
  IF v_loan.id IS NULL OR v_account.id IS NULL THEN RAISE EXCEPTION 'Préstamo o cuenta no encontrados'; END IF;
  IF p_amount > v_loan.outstanding_balance THEN RAISE EXCEPTION 'El abono excede el saldo pendiente'; END IF;
  v_column := CASE upper(p_currency) WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  EXECUTE format('SELECT %I FROM public.accounts WHERE id = $1', v_column) INTO v_balance USING v_account.id;
  IF COALESCE(v_balance, 0) < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  IF upper(p_currency) <> 'PDH' THEN
    SELECT COALESCE(exchange_rate_to_pdh, 0) INTO v_rate FROM public.currencies WHERE iso_symbol = upper(p_currency) LIMIT 1;
    IF v_rate <= 0 THEN RAISE EXCEPTION 'No hay tasa de conversión para %', upper(p_currency); END IF;
  END IF;
  v_new := v_loan.outstanding_balance - p_amount;
  IF v_new <= 0 THEN
    UPDATE public.loan_payments SET status = 'paid', paid_date = now() WHERE loan_id = v_loan.id AND status <> 'paid';
    UPDATE public.loans SET outstanding_balance = 0, status = 'completed', end_date = now(), updated_at = now() WHERE id = v_loan.id;
  ELSE
    SELECT count(*)::integer INTO v_weeks FROM public.loan_payments WHERE loan_id = v_loan.id AND status <> 'paid';
    v_weekly_rate := COALESCE(v_loan.interest_rate, 0) / 52 / 100;
    v_payment_amount := CASE WHEN v_weeks <= 0 OR v_weekly_rate = 0 THEN v_new / GREATEST(v_weeks, 1)
      ELSE v_new * v_weekly_rate * power(1 + v_weekly_rate, v_weeks) / (power(1 + v_weekly_rate, v_weeks) - 1) END;
    v_remaining := v_new;
    FOR v_payment IN SELECT * FROM public.loan_payments WHERE loan_id = v_loan.id AND status <> 'paid' ORDER BY payment_number FOR UPDATE LOOP
      v_interest := v_remaining * v_weekly_rate; v_principal := GREATEST(0, v_payment_amount - v_interest); v_remaining := GREATEST(0, v_remaining - v_principal);
      UPDATE public.loan_payments SET amount = round(v_payment_amount, 2), principal = round(v_principal, 2), interest = round(GREATEST(0, v_interest), 2) WHERE id = v_payment.id;
    END LOOP;
    UPDATE public.loans SET outstanding_balance = v_new, monthly_payment = round(v_payment_amount, 2), updated_at = now() WHERE id = v_loan.id;
  END IF;
  EXECUTE format('UPDATE public.accounts SET %I = %I - $1, updated_at = now() WHERE id = $2', v_column, v_column) USING p_amount, v_account.id;
  UPDATE public.bank_main_account SET balance_pdh = balance_pdh + p_amount * v_rate, updated_at = now() WHERE id = 'bank-main';
  INSERT INTO public.transactions (id, transaction_type, from_account_id, from_account_number, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'loan_payment', v_account.id, v_account.account_number, 'bank-main', 'MAHR-BANK-000001', p_amount, upper(p_currency), 'Abono a capital - Préstamo ' || left(v_loan.id, 8));
END; $$;

REVOKE ALL ON FUNCTION public.pay_loan_extra_atomic(text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_loan_extra_atomic(text,numeric,text) TO authenticated;
