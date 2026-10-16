-- Corrige la prueba de 1 LDH que se registró como 1 KYD.
DO $$
DECLARE
  v_tx public.private_bank_transactions%ROWTYPE;
  v_account public.private_bank_accounts%ROWTYPE;
BEGIN
  SELECT t.* INTO v_tx
  FROM public.private_bank_transactions t
  JOIN public.private_banks b ON b.id = t.private_bank_id
  WHERE b.name ILIKE '%BURS%'
    AND t.type = 'deposit'
    AND t.currency_iso = 'LDH'
    AND t.amount = 1
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_account
  FROM public.private_bank_accounts
  WHERE id = v_tx.to_account_id
  FOR UPDATE;

  UPDATE public.private_bank_accounts
  SET balance_real = balance_real + 8,
      updated_at = now()
  WHERE id = v_account.id;

  UPDATE public.private_bank_transactions
  SET amount = 9,
      description = replace(description, '1.00 LDH', '1.00 LDH → 9.00 moneda de cuenta')
  WHERE id = v_tx.id;
END $$;
