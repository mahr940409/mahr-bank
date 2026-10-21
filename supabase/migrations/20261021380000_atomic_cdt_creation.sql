CREATE OR REPLACE FUNCTION public.create_cdt_atomic(
  p_account_id text, p_user_id text, p_amount numeric, p_currency text,
  p_interest_rate numeric, p_term_weeks integer, p_start_date timestamptz,
  p_maturity_date timestamptz, p_final_amount numeric, p_penalty numeric,
  p_frequency text, p_is_indefinite boolean
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_account public.accounts; v_column text; v_balance numeric; v_id text;
BEGIN
  IF p_amount <= 0 OR p_final_amount < p_amount OR p_interest_rate < 0 THEN RAISE EXCEPTION 'Parámetros de CDT inválidos'; END IF;
  IF upper(p_currency) NOT IN ('PDH','BDH','LDH') THEN RAISE EXCEPTION 'Moneda inválida'; END IF;
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF v_account.id IS NULL THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;
  v_column := CASE upper(p_currency) WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  EXECUTE format('SELECT COALESCE(%I, 0) FROM public.accounts WHERE id = $1', v_column) INTO v_balance USING p_account_id;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  v_id := gen_random_uuid()::text;
  INSERT INTO public.cdts (id, account_id, user_id, amount, currency, interest_rate, term_months, start_date, maturity_date, final_amount, early_withdrawal_penalty, interest_payout_frequency, is_indefinite)
    VALUES (v_id, p_account_id, p_user_id, p_amount, upper(p_currency), p_interest_rate, p_term_weeks, p_start_date, p_maturity_date, p_final_amount, p_penalty, p_frequency, p_is_indefinite);
  EXECUTE format('UPDATE public.accounts SET %I = %I - $1, updated_at = now() WHERE id = $2', v_column, v_column) USING p_amount, p_account_id;
  INSERT INTO public.transactions (id, transaction_type, from_account_id, from_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), 'cdt_creation', v_account.id, v_account.account_number, p_amount, upper(p_currency), 'Creación de CDT ' || left(v_id, 8));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_cdt_atomic(text,text,numeric,text,numeric,integer,timestamptz,timestamptz,numeric,numeric,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cdt_atomic(text,text,numeric,text,numeric,integer,timestamptz,timestamptz,numeric,numeric,text,boolean) TO authenticated;
