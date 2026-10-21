CREATE OR REPLACE FUNCTION public.create_loan_atomic(
  p_loan_id text, p_user_id text, p_account_id text, p_amount numeric,
  p_currency text, p_interest_rate numeric, p_term_weeks integer,
  p_start_date timestamptz DEFAULT now()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account public.accounts; v_column text; v_balance numeric; v_rate numeric := 1;
  v_weekly_rate numeric; v_weekly_payment numeric; v_remaining numeric;
  v_interest numeric; v_principal numeric; v_i integer; v_due timestamptz;
BEGIN
  IF p_amount <= 0 OR p_term_weeks <= 0 OR p_interest_rate < 0 THEN RAISE EXCEPTION 'Parámetros del préstamo inválidos'; END IF;
  IF upper(p_currency) NOT IN ('PDH','BDH','LDH') THEN RAISE EXCEPTION 'Moneda de cuenta inválida'; END IF;
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF v_account.id IS NULL THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;
  v_column := CASE upper(p_currency) WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  IF upper(p_currency) <> 'PDH' THEN
    SELECT COALESCE(exchange_rate_to_pdh, 0) INTO v_rate FROM public.currencies WHERE iso_symbol = upper(p_currency) LIMIT 1;
    IF v_rate <= 0 THEN RAISE EXCEPTION 'No hay tasa de conversión para %', upper(p_currency); END IF;
  END IF;
  PERFORM 1 FROM public.bank_main_account WHERE id = 'bank-main' AND balance_pdh >= p_amount * v_rate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fondos insuficientes en MAHR Bank'; END IF;
  EXECUTE format('SELECT COALESCE(%I, 0) FROM public.accounts WHERE id = $1', v_column) INTO v_balance USING p_account_id;
  v_weekly_rate := p_interest_rate / 52 / 100;
  v_weekly_payment := CASE WHEN v_weekly_rate = 0 THEN p_amount / p_term_weeks ELSE p_amount * v_weekly_rate * power(1 + v_weekly_rate, p_term_weeks) / (power(1 + v_weekly_rate, p_term_weeks) - 1) END;
  INSERT INTO public.loans (id, user_id, account_id, amount, currency, interest_rate, term_months, monthly_payment, outstanding_balance, status, start_date, end_date)
    VALUES (p_loan_id, p_user_id, p_account_id, p_amount, upper(p_currency), p_interest_rate, p_term_weeks, round(v_weekly_payment, 2), p_amount, 'active', p_start_date, p_start_date + make_interval(days => p_term_weeks * 7));
  v_remaining := p_amount;
  FOR v_i IN 1..p_term_weeks LOOP
    v_interest := v_remaining * v_weekly_rate; v_principal := GREATEST(0, v_weekly_payment - v_interest); v_due := p_start_date + make_interval(days => v_i * 7);
    INSERT INTO public.loan_payments (id, loan_id, payment_number, due_date, amount, principal, interest, penalty, status)
      VALUES ('PAY-' || extract(epoch FROM clock_timestamp())::bigint || '-' || v_i || '-' || substr(gen_random_uuid()::text, 1, 8), p_loan_id, v_i, v_due, round(v_weekly_payment, 2), round(v_principal, 2), round(GREATEST(0, v_interest), 2), 0, 'pending');
    v_remaining := GREATEST(0, v_remaining - v_principal);
  END LOOP;
  EXECUTE format('UPDATE public.accounts SET %I = %I + $1, updated_at = now() WHERE id = $2', v_column, v_column) USING p_amount, p_account_id;
  UPDATE public.bank_main_account SET balance_pdh = balance_pdh - (p_amount * v_rate), updated_at = now() WHERE id = 'bank-main';
  INSERT INTO public.transactions (id, transaction_type, from_account_id, from_account_number, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'loan_disbursement', 'bank-main', 'MAHR-BANK-000001', v_account.id, v_account.account_number, p_amount, upper(p_currency), 'Desembolso de préstamo ' || left(p_loan_id, 8));
END; $$;
REVOKE ALL ON FUNCTION public.create_loan_atomic(text,text,text,numeric,text,numeric,integer,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_loan_atomic(text,text,text,numeric,text,numeric,integer,timestamptz) TO authenticated;
