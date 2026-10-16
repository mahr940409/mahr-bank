-- Revierte el depósito de prueba que superó la circulación física disponible.
-- Está deliberadamente limitado a Banco BURS y al importe exacto de la prueba.
DO $$
DECLARE
  v_tx public.private_bank_transactions%ROWTYPE;
  v_bank public.private_banks%ROWTYPE;
  v_account public.private_bank_accounts%ROWTYPE;
  v_item record;
  v_denom public.banknote_denominations%ROWTYPE;
  v_held integer;
BEGIN
  SELECT t.* INTO v_tx
  FROM public.private_bank_transactions t
  JOIN public.private_banks b ON b.id = t.private_bank_id
  WHERE b.name ILIKE '%BURS%'
    AND t.type = 'deposit'
    AND t.money_source = 'printed'
    AND t.amount = 1000010
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_bank FROM public.private_banks WHERE id = v_tx.private_bank_id FOR UPDATE;
  SELECT * INTO v_account FROM public.private_bank_accounts WHERE id = v_tx.to_account_id FOR UPDATE;

  IF v_account.balance_real < v_tx.amount THEN
    RAISE EXCEPTION 'No se puede revertir: el saldo de la cuenta BURS ya fue utilizado.';
  END IF;

  UPDATE public.private_bank_accounts
  SET balance_real = balance_real - v_tx.amount,
      updated_at = now()
  WHERE id = v_account.id;

  FOR v_item IN SELECT key, value::integer AS quantity FROM jsonb_each_text(COALESCE(v_tx.denomination_breakdown, '{}'::jsonb)) LOOP
    SELECT d.* INTO v_denom
    FROM public.banknote_denominations d
    WHERE d.national_bank_id = v_bank.national_bank_id
      AND d.value = v_item.key::numeric;

    IF FOUND THEN
      SELECT quantity INTO v_held
      FROM public.banknote_custody
      WHERE bank_type = 'private' AND bank_id = v_bank.id AND denomination_id = v_denom.id
      FOR UPDATE;

      IF COALESCE(v_held, 0) < v_item.quantity THEN
        RAISE EXCEPTION 'Custodia insuficiente para revertir la denominación %.', v_item.key;
      END IF;

      UPDATE public.banknote_custody
      SET quantity = quantity - v_item.quantity, updated_at = now()
      WHERE bank_type = 'private' AND bank_id = v_bank.id AND denomination_id = v_denom.id;
    END IF;
  END LOOP;

  DELETE FROM public.private_bank_transactions WHERE id = v_tx.id;
END $$;
