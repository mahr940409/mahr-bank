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


CREATE OR REPLACE FUNCTION public.process_bond_coupon_atomic(p_holding_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_holding public.bond_holdings; v_bond public.state_bonds; v_account public.accounts;
  v_row public.bank_backings; v_now timestamptz := now(); v_weeks integer;
  v_paid_weeks integer := 0; v_coupon numeric; v_paid_interest numeric := 0;
  v_principal numeric := 0; v_total numeric; v_available numeric := 0; v_matured boolean;
  v_rate numeric; v_free numeric; v_needed numeric; v_units numeric;
BEGIN
  SELECT * INTO v_holding FROM public.bond_holdings WHERE id = p_holding_id FOR UPDATE;
  IF v_holding.id IS NULL THEN RAISE EXCEPTION 'Tenencia de bono no encontrada'; END IF;
  IF v_holding.status <> 'active' THEN RETURN jsonb_build_object('paid', 0, 'total', 0); END IF;
  SELECT * INTO v_bond FROM public.state_bonds WHERE id = v_holding.bond_id FOR UPDATE;
  SELECT * INTO v_account FROM public.accounts WHERE id = v_holding.account_id FOR UPDATE;
  IF v_account.id IS NULL OR v_bond.id IS NULL THEN RAISE EXCEPTION 'Datos del bono incompletos'; END IF;

  FOR v_row IN SELECT * FROM public.bank_backings
    WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id FOR UPDATE LOOP
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh
        ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END
       FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 THEN v_available := v_available + v_free * v_rate; END IF;
  END LOOP;

  v_weeks := greatest(0, floor(extract(epoch FROM (v_now - v_holding.last_coupon_at)) / (7 * 24 * 60 * 60))::integer);
  v_coupon := v_holding.principal_pdh * (v_bond.annual_rate / 52 / 100);
  v_matured := v_now >= v_holding.maturity_at;
  IF v_coupon > 0 THEN v_paid_weeks := least(v_weeks, floor(v_available / v_coupon)::integer); END IF;
  v_paid_interest := v_paid_weeks * v_coupon;
  v_available := v_available - v_paid_interest;
  IF v_matured AND v_available + 1e-9 >= v_holding.principal_pdh THEN v_principal := v_holding.principal_pdh; END IF;
  IF v_paid_weeks = 0 AND v_principal = 0 THEN RETURN jsonb_build_object('paid', 0, 'total', 0); END IF;
  v_total := v_paid_interest + v_principal;

  v_needed := v_total;
  FOR v_row IN SELECT * FROM public.bank_backings
    WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id ORDER BY currency_iso FOR UPDATE LOOP
    EXIT WHEN v_needed <= 1e-9;
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh
        ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END
       FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 AND v_free > 0 THEN
      v_units := least(v_free, v_needed / v_rate);
      UPDATE public.bank_backings SET amount = amount - v_units, updated_at = now() WHERE id = v_row.id;
      v_needed := v_needed - v_units * v_rate;
    END IF;
  END LOOP;
  IF v_needed > 1e-6 THEN RAISE EXCEPTION 'Respaldo insuficiente para pagar el bono'; END IF;
  UPDATE public.accounts SET balance_pdh = balance_pdh + v_total, updated_at = now() WHERE id = v_account.id;
  UPDATE public.bond_holdings SET last_coupon_at = v_holding.last_coupon_at + make_interval(days => v_paid_weeks * 7),
    coupons_paid = v_holding.coupons_paid + v_paid_weeks, total_interest_pdh = v_holding.total_interest_pdh + v_paid_interest,
    status = CASE WHEN v_principal > 0 THEN 'matured' ELSE 'active' END WHERE id = v_holding.id;
  INSERT INTO public.transactions (id, transaction_type, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8),
      'cdt_interest_payout', v_account.id, v_account.account_number, v_total, 'PDH',
      CASE WHEN v_principal > 0 THEN 'Bono vencido: capital + cupones pendientes' ELSE 'Pago de cupón de bono' END);
  RETURN jsonb_build_object('paid', v_paid_weeks, 'total', v_total);
END; $$;

REVOKE ALL ON FUNCTION public.process_bond_coupon_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_bond_coupon_atomic(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.repurchase_bond_atomic(p_holding_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_holding public.bond_holdings; v_bond public.state_bonds; v_account public.accounts;
  v_row public.bank_backings; v_rate numeric; v_free numeric; v_available numeric;
  v_weeks integer; v_coupon numeric; v_due numeric; v_total numeric; v_needed numeric; v_units numeric;
BEGIN
  SELECT * INTO v_holding FROM public.bond_holdings WHERE id = p_holding_id FOR UPDATE;
  IF v_holding.id IS NULL THEN RAISE EXCEPTION 'Tenencia de bono no encontrada'; END IF;
  IF v_holding.status <> 'active' THEN RAISE EXCEPTION 'Tenencia no activa'; END IF;
  SELECT * INTO v_bond FROM public.state_bonds WHERE id = v_holding.bond_id FOR UPDATE;
  SELECT * INTO v_account FROM public.accounts WHERE id = v_holding.account_id FOR UPDATE;
  IF v_bond.id IS NULL OR v_account.id IS NULL THEN RAISE EXCEPTION 'Datos del bono incompletos'; END IF;
  v_weeks := greatest(0, floor(extract(epoch FROM (now() - v_holding.last_coupon_at)) / (7 * 24 * 60 * 60))::integer);
  v_coupon := v_holding.principal_pdh * (v_bond.annual_rate / 52 / 100);
  v_due := v_coupon * v_weeks;
  v_total := v_holding.principal_pdh + v_due;
  v_available := 0;
  FOR v_row IN SELECT * FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id FOR UPDATE LOOP
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 THEN v_available := v_available + v_free * v_rate; END IF;
  END LOOP;
  IF v_available + 1e-9 < v_total THEN RAISE EXCEPTION 'Respaldo insuficiente para la recompra'; END IF;
  v_needed := v_total;
  FOR v_row IN SELECT * FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = v_bond.national_bank_id ORDER BY currency_iso FOR UPDATE LOOP
    EXIT WHEN v_needed <= 1e-9;
    v_rate := CASE WHEN v_row.currency_iso = 'PDH' THEN 1 ELSE
      (SELECT CASE WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END FROM public.currencies c WHERE c.iso_symbol = v_row.currency_iso) END;
    v_free := greatest(0, v_row.amount - v_row.frozen);
    IF coalesce(v_rate, 0) > 0 AND v_free > 0 THEN
      v_units := least(v_free, v_needed / v_rate);
      UPDATE public.bank_backings SET amount = amount - v_units, updated_at = now() WHERE id = v_row.id;
      v_needed := v_needed - v_units * v_rate;
    END IF;
  END LOOP;
  UPDATE public.accounts SET balance_pdh = balance_pdh + v_total, updated_at = now() WHERE id = v_account.id;
  UPDATE public.bond_holdings SET status = 'repurchased', coupons_paid = coupons_paid + v_weeks,
    total_interest_pdh = total_interest_pdh + v_due, last_coupon_at = now() WHERE id = v_holding.id;
  INSERT INTO public.transactions (id, transaction_type, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8),
      'cdt_liquidation', v_account.id, v_account.account_number, v_total, 'PDH',
      'Recompra anticipada de bono: capital + cupones pendientes');
END; $$;

REVOKE ALL ON FUNCTION public.repurchase_bond_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repurchase_bond_atomic(text) TO authenticated;


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


CREATE OR REPLACE FUNCTION public.liquidate_cdt_atomic(p_cdt_id text, p_early boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cdt public.cdts; v_account public.accounts; v_column text; v_return numeric; v_penalty numeric := 0; v_type text; v_desc text;
BEGIN
  SELECT * INTO v_cdt FROM public.cdts WHERE id = p_cdt_id FOR UPDATE;
  IF v_cdt.id IS NULL THEN RAISE EXCEPTION 'CDT no encontrado'; END IF;
  IF v_cdt.status <> 'active' THEN RAISE EXCEPTION 'El CDT ya fue liquidado o cancelado'; END IF;
  IF NOT p_early AND NOT v_cdt.is_indefinite AND v_cdt.maturity_date > now() THEN RAISE EXCEPTION 'El CDT aún no ha vencido'; END IF;
  SELECT * INTO v_account FROM public.accounts WHERE id = v_cdt.account_id FOR UPDATE;
  IF v_account.id IS NULL THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;
  v_column := CASE upper(v_cdt.currency) WHEN 'BDH' THEN 'balance_bdh' WHEN 'LDH' THEN 'balance_ldh' ELSE 'balance_pdh' END;
  IF v_cdt.is_indefinite THEN
    v_return := v_cdt.amount; v_type := 'cdt_maturity'; v_desc := 'Cancelación de CDT indefinido';
  ELSIF p_early THEN
    v_penalty := v_cdt.amount * v_cdt.early_withdrawal_penalty;
    v_return := v_cdt.amount - v_penalty; v_type := 'cdt_early_withdrawal'; v_desc := 'Retiro anticipado de CDT con penalización';
  ELSE
    v_return := v_cdt.final_amount; v_type := 'cdt_maturity'; v_desc := 'Vencimiento de CDT con intereses';
  END IF;
  UPDATE public.cdts SET status = CASE WHEN p_early AND NOT v_cdt.is_indefinite THEN 'cancelled' ELSE 'liquidated' END, updated_at = now() WHERE id = v_cdt.id;
  EXECUTE format('UPDATE public.accounts SET %I = %I + $1, updated_at = now() WHERE id = $2', v_column, v_column) USING v_return, v_account.id;
  INSERT INTO public.transactions (id, transaction_type, to_account_id, to_account_number, amount, currency, description)
    VALUES ('TXN-' || extract(epoch FROM clock_timestamp())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8), v_type, v_account.id, v_account.account_number, v_return, upper(v_cdt.currency), v_desc);
  RETURN v_return;
END; $$;
REVOKE ALL ON FUNCTION public.liquidate_cdt_atomic(text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidate_cdt_atomic(text,boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.adjust_national_backing_atomic(p_bank_id text, p_currency text, p_delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_backing public.bank_backings; v_main public.bank_main_account; v_rate numeric; v_value numeric;
  v_own text; v_custody numeric; v_frozen numeric;
BEGIN
  IF p_delta = 0 THEN RAISE EXCEPTION 'El ajuste no puede ser cero'; END IF;
  SELECT c.iso_symbol INTO v_own FROM public.national_banks nb JOIN public.countries co ON co.id = nb.country_id JOIN public.currencies c ON c.id = co.currency_id WHERE nb.id = p_bank_id;
  IF v_own IS NULL THEN RAISE EXCEPTION 'Banco nacional no encontrado'; END IF;
  IF upper(p_currency) = v_own THEN RAISE EXCEPTION 'No se puede respaldar con la moneda propia del banco'; END IF;
  SELECT CASE WHEN c.iso_symbol = 'PDH' THEN 1 WHEN c.is_fixed_rate THEN c.exchange_rate_to_pdh ELSE c.pdh_reserves / NULLIF(greatest(0, c.printed_amount - c.burned_amount), 0) END INTO v_rate FROM public.currencies c WHERE c.iso_symbol = upper(p_currency);
  IF coalesce(v_rate, 0) <= 0 THEN RAISE EXCEPTION 'La moneda no tiene valor definido'; END IF;
  SELECT * INTO v_main FROM public.bank_main_account WHERE id = 'bank-main' FOR UPDATE;
  IF v_main.id IS NULL THEN RAISE EXCEPTION 'Cuenta MAHR Bank no encontrada'; END IF;
  SELECT * INTO v_backing FROM public.bank_backings WHERE bank_type = 'national' AND bank_id = p_bank_id AND currency_iso = upper(p_currency) FOR UPDATE;
  IF v_backing.id IS NULL THEN
    IF p_delta < 0 THEN RAISE EXCEPTION 'Respaldo insuficiente'; END IF;
    INSERT INTO public.bank_backings (bank_type, bank_id, currency_iso, amount, frozen) VALUES ('national', p_bank_id, upper(p_currency), p_delta, 0) RETURNING * INTO v_backing;
  ELSE
    IF p_delta < 0 AND v_backing.amount - v_backing.frozen + 1e-9 < abs(p_delta) THEN RAISE EXCEPTION 'La parte disponible del respaldo es insuficiente'; END IF;
    UPDATE public.bank_backings SET amount = amount + p_delta, updated_at = now() WHERE id = v_backing.id;
  END IF;
  v_value := p_delta * v_rate;
  IF p_delta < 0 AND v_main.balance_pdh + v_value < -1e-9 THEN RAISE EXCEPTION 'MAHR Bank no tiene fondos para devolver el respaldo'; END IF;
  UPDATE public.bank_main_account SET balance_pdh = balance_pdh + v_value, updated_at = now() WHERE id = 'bank-main';
  SELECT amount, frozen INTO v_custody, v_frozen FROM public.bank_backings WHERE id = v_backing.id;
  INSERT INTO public.national_bank_custody_accounts (national_bank_id, custody_type, currency_iso, amount, frozen)
    VALUES (p_bank_id, 'international_backing', upper(p_currency), v_custody, v_frozen)
    ON CONFLICT (national_bank_id, custody_type, currency_iso) DO UPDATE SET amount = excluded.amount, frozen = excluded.frozen, updated_at = now();
  INSERT INTO public.national_bank_transactions (national_bank_id, transaction_type, backing_amount, backing_currency, description, status)
    VALUES (p_bank_id, CASE WHEN p_delta > 0 THEN 'mahr_deposit_backing' ELSE 'mahr_withdraw_backing' END, abs(p_delta), upper(p_currency), CASE WHEN p_delta > 0 THEN 'Depósito de respaldo internacional en MAHR Bank' ELSE 'Retiro de respaldo internacional desde MAHR Bank' END, 'executed');
END; $$;
REVOKE ALL ON FUNCTION public.adjust_national_backing_atomic(text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_national_backing_atomic(text,text,numeric) TO authenticated;
