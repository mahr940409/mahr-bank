-- La aplicación ya utiliza Supabase Auth. El rol anon no debe poder leer ni
-- modificar el libro financiero aunque conozca el endpoint de Supabase.
-- Las políticas existentes se conservan para authenticated mientras se migra
-- progresivamente a permisos por rol y por operación.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'bank_main_account',
    'accounts',
    'transactions',
    'national_banks',
    'national_bank_accounts',
    'national_bank_transactions',
    'national_bank_custody_accounts',
    'banknote_denominations',
    'bank_backings',
    'private_banks',
    'private_bank_accounts',
    'private_bank_transactions',
    'currencies',
    'countries',
    'loans',
    'loan_payments',
    'state_bonds',
    'bond_holdings',
    'cdts',
    'payroll_configs',
    'payroll_employees',
    'payroll_payments',
    'commodities',
    'commodity_deposits',
    'bank_settings'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
    END IF;
  END LOOP;
END $$;

-- Evita que el rol anónimo invoque funciones financieras futuras por accidente.
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;
