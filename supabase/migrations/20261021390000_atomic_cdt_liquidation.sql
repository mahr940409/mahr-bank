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
