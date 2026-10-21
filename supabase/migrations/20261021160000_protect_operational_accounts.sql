CREATE OR REPLACE FUNCTION public.prevent_operational_account_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'bank_main_account' THEN
    RAISE EXCEPTION 'La cuenta principal del MAHR Bank no se puede eliminar';
  END IF;
  IF TG_TABLE_NAME = 'national_bank_accounts' AND OLD.account_type = 'bank_treasury' THEN
    RAISE EXCEPTION 'La cuenta propia de un Banco Nacional no se puede eliminar';
  END IF;
  IF TG_TABLE_NAME = 'private_bank_accounts' AND OLD.type = 'main' THEN
    RAISE EXCEPTION 'La cuenta principal de un banco privado no se puede eliminar';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_bank_main_account_delete ON public.bank_main_account;
CREATE TRIGGER protect_bank_main_account_delete
  BEFORE DELETE ON public.bank_main_account
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_account_delete();

DROP TRIGGER IF EXISTS protect_national_treasury_delete ON public.national_bank_accounts;
CREATE TRIGGER protect_national_treasury_delete
  BEFORE DELETE ON public.national_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_account_delete();

DROP TRIGGER IF EXISTS protect_private_main_delete ON public.private_bank_accounts;
CREATE TRIGGER protect_private_main_delete
  BEFORE DELETE ON public.private_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_account_delete();
