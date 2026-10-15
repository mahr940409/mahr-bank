-- Crear tabla para la cuenta principal del banco
CREATE TABLE IF NOT EXISTS public.bank_main_account (
  id TEXT PRIMARY KEY DEFAULT 'bank-main',
  account_number TEXT NOT NULL DEFAULT 'MAHR-BANK-000001',
  balance_bdh DECIMAL(20, 2) NOT NULL DEFAULT 0,
  balance_ldh DECIMAL(20, 2) NOT NULL DEFAULT 0,
  balance_pdh DECIMAL(20, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de cuentas de clientes
CREATE TABLE IF NOT EXISTS public.accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  account_number TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL CHECK (account_type IN ('personal', 'business')),
  balance_bdh DECIMAL(20, 2) NOT NULL DEFAULT 0,
  balance_ldh DECIMAL(20, 2) NOT NULL DEFAULT 0,
  balance_pdh DECIMAL(20, 2) NOT NULL DEFAULT 0,
  monthly_fee DECIMAL(10, 2) NOT NULL DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de transacciones
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'fee', 'commission')),
  from_account_id TEXT,
  from_account_number TEXT,
  to_account_id TEXT,
  to_account_number TEXT,
  amount DECIMAL(20, 2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('BDH', 'LDH', 'PDH')),
  commission DECIMAL(20, 2),
  commission_currency TEXT CHECK (commission_currency IN ('BDH', 'LDH', 'PDH')),
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON public.accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_from_account ON public.transactions(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON public.transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- Insertar la cuenta principal del banco si no existe
INSERT INTO public.bank_main_account (id, account_number, balance_bdh, balance_ldh, balance_pdh)
VALUES ('bank-main', 'MAHR-BANK-000001', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at en accounts
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para actualizar updated_at en bank_main_account
CREATE TRIGGER update_bank_main_account_updated_at
  BEFORE UPDATE ON public.bank_main_account
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.bank_main_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: Permitir acceso completo para operaciones (sistema de administrador único)
-- Como no hay autenticación de usuarios, permitimos acceso anónimo para el administrador

CREATE POLICY "Allow all operations on bank_main_account"
  ON public.bank_main_account
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on accounts"
  ON public.accounts
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on transactions"
  ON public.transactions
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);