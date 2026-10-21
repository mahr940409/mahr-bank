CREATE OR REPLACE FUNCTION public.pay_loan_installment_atomic(
  p_loan_id text,
  p_payment_id text,
  p_currency text DEFAULT 'PDH'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans;
  v_payment public.loan_payments;
  v_account public.accounts;
  v_total numeric;
  v_new_outstanding numeric;
  v_account_column text;
  v_account_balance numeric;
  v_pdh_rate numeric := 1;
  v_account_pdh numeric;
BEGIN
  IF upper(p_currency) NOT IN ('PDH', 'BDH', 'LDH') THEN RAISE EXCEPTION 'Moneda de cuenta inválida'; END IF;
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  SELECT * INTO v_payment FROM public.loan_payments WHERE id = p_payment_id AND loan_id = p_loan_id FOR UPDATE;
  IF v_loan.id IS NULL OR v_payment.id IS NULL THEN RAISE EXCEPTION 'Préstamo o cuota no encontrados'; END IF;
  IF v_payment.status = 'paid' THEN RAISE EXCEPTION 'La cuota ya fue pagada'; END IF;
  SELECT * INTO v_account FROM public.accounts WHERE id = v_loan.account_id FOR UPDATE;
  IF v_account.id IS NULL THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;

  v_total := v_payment.amount + v_payment.penalty;
  v_account_column := CASE upper(p_currency) WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  EXECUTE format('SELECT %I FROM public.accounts WHERE id = $1', v_account_column) INTO v_account_balance USING v_account.id;
  IF COALESCE(v_account_balance, 0) < v_total THEN RAISE EXCEPTION 'Saldo insuficiente para pagar la cuota'; END IF;

  IF upper(p_currency) <> 'PDH' THEN
    SELECT COALESCE(exchange_rate_to_pdh, 0) INTO v_pdh_rate FROM public.currencies WHERE iso_symbol = upper(p_currency) LIMIT 1;
    IF v_pdh_rate IS NULL OR v_pdh_rate <= 0 THEN RAISE EXCEPTION 'No hay tasa de conversión para %', upper(p_currency); END IF;
  END IF;
  v_account_pdh := v_total * v_pdh_rate;
  v_new_outstanding := GREATEST(0, v_loan.outstanding_balance - v_payment.principal);

  EXECUTE format('UPDATE public.accounts SET %I = %I - $1, updated_at = now() WHERE id = $2', v_account_column, v_account_column)
    USING v_total, v_account.id;
  UPDATE public.bank_main_account SET balance_pdh = balance_pdh + v_account_pdh WHERE id = 'bank-main';
  UPDATE public.loan_payments SET status = 'paid', paid_date = now() WHERE id = v_payment.id;
  UPDATE public.loans SET outstanding_balance = v_new_outstanding,
    status = CASE WHEN v_new_outstanding <= 0 THEN 'completed' ELSE 'active' END,
    updated_at = now() WHERE id = v_loan.id;
  INSERT INTO public.transactions (id, transaction_type, from_account_id, from_account_number,
    to_account_id, to_account_number, amount, currency, description)
  VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8),
    'loan_payment', v_account.id, v_account.account_number, 'bank-main', 'MAHR-BANK-000001',
    v_total, upper(p_currency), 'Pago cuota #' || v_payment.payment_number || ' - Préstamo ' || left(v_loan.id, 8));
END;
$$;

REVOKE ALL ON FUNCTION public.pay_loan_installment_atomic(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_loan_installment_atomic(text, text, text) TO authenticated;
