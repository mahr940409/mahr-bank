-- El saldo congelado del fiador se mantiene fuera del saldo utilizable.
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_balance_frozen_lte_total;

-- Refleja en la cuenta origen el fiador ya descontado de los bancos privados.
-- No cambia el saldo total: solo clasifica esos fondos como congelados.
UPDATE public.accounts a
SET balance_frozen = COALESCE(a.balance_frozen, 0) + x.amount
FROM (
  SELECT guarantor_source_account_id AS account_id,
         SUM(guarantor_frozen_kyd) AS amount
  FROM public.private_banks
  WHERE guarantor_active = true
    AND guarantor_source_type = 'mahr'
    AND guarantor_source_account_id IS NOT NULL
    AND guarantor_source_account_id <> 'bank-main'
  GROUP BY guarantor_source_account_id
) x
WHERE a.id = x.account_id
  AND COALESCE(a.balance_frozen, 0) = 0;

-- El saldo congelado del fiador se mantiene fuera del saldo utilizable:
-- puede ser mayor que balance_pdh después de descontarse de la cuenta.
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_balance_frozen_nonnegative;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_balance_frozen_nonnegative
  CHECK (balance_frozen >= 0);
