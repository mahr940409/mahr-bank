-- Financial state must never be writable or readable through the anonymous key.
DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'accounts', 'bank_main_account', 'transactions',
    'national_banks', 'national_bank_accounts', 'national_bank_transactions',
    'national_bank_custody_accounts', 'private_banks', 'private_bank_accounts',
    'private_bank_transactions', 'bank_backings', 'banknote_custody',
    'mahr_reserve_custody', 'loans', 'loan_payments', 'state_bonds',
    'bond_holdings', 'bond_purchase_orders', 'bond_market_orders',
    'bond_market_trades', 'cheques', 'promissory_notes'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND roles::text LIKE '%anon%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table
        AND policyname = 'authenticated_financial_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY authenticated_financial_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        v_table
      );
    END IF;
  END LOOP;
END $$;
