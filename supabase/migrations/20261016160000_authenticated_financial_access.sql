-- El acceso anónimo ya fue revocado. Esta política mantiene operativa la
-- aplicación para usuarios autenticados mientras se implementan roles más
-- específicos por módulo.
DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'bank_main_account', 'accounts', 'transactions',
    'national_banks', 'national_bank_accounts', 'national_bank_transactions',
    'national_bank_custody_accounts', 'banknote_denominations', 'bank_backings',
    'private_banks', 'private_bank_accounts', 'private_bank_transactions',
    'currencies', 'countries', 'loans', 'loan_payments', 'state_bonds',
    'bond_holdings', 'cdts', 'payroll_configs', 'payroll_employees',
    'payroll_payments', 'commodities', 'commodity_deposits', 'bank_settings'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      policy_name := 'authenticated_access_' || table_name;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
          policy_name, table_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;
