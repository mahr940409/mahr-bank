-- Tabla para configuración de nóminas
CREATE TABLE public.payroll_configs (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  employer_account_id text NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  frequency text NOT NULL DEFAULT 'monthly', -- 'weekly', 'biweekly', 'monthly'
  pay_day integer NOT NULL DEFAULT 1, -- día del mes o semana
  currency text NOT NULL DEFAULT 'PDH',
  is_active boolean NOT NULL DEFAULT true,
  next_payment_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabla para empleados en nómina
CREATE TABLE public.payroll_employees (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  payroll_id text NOT NULL REFERENCES public.payroll_configs(id) ON DELETE CASCADE,
  employee_account_id text NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  salary numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(payroll_id, employee_account_id)
);

-- Tabla para historial de pagos de nómina
CREATE TABLE public.payroll_payments (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  payroll_id text NOT NULL REFERENCES public.payroll_configs(id) ON DELETE CASCADE,
  employee_account_id text NOT NULL REFERENCES public.accounts(id),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'PDH',
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  payment_date timestamp with time zone NOT NULL DEFAULT now(),
  transaction_id text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payroll_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir todas las operaciones (sistema interno sin auth)
CREATE POLICY "Allow all operations on payroll_configs" 
ON public.payroll_configs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on payroll_employees" 
ON public.payroll_employees FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on payroll_payments" 
ON public.payroll_payments FOR ALL USING (true) WITH CHECK (true);

-- Triggers para updated_at
CREATE TRIGGER update_payroll_configs_updated_at
BEFORE UPDATE ON public.payroll_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_employees_updated_at
BEFORE UPDATE ON public.payroll_employees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();