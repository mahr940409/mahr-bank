-- Remove the foreign key constraint that prevents using bank-main as employer
ALTER TABLE public.payroll_configs 
DROP CONSTRAINT IF EXISTS payroll_configs_employer_account_id_fkey;