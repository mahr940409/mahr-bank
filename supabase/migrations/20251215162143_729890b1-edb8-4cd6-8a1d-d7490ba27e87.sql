-- Create CDT (Certificate of Deposit) table
CREATE TABLE public.cdts (
  id text NOT NULL DEFAULT (gen_random_uuid())::text PRIMARY KEY,
  account_id text NOT NULL,
  user_id text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'PDH',
  interest_rate numeric NOT NULL,
  term_months integer NOT NULL,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  maturity_date timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'active',
  final_amount numeric NOT NULL,
  early_withdrawal_penalty numeric NOT NULL DEFAULT 0.1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cdts ENABLE ROW LEVEL SECURITY;

-- Create policy for all operations
CREATE POLICY "Allow all operations on cdts" 
ON public.cdts 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_cdts_updated_at
BEFORE UPDATE ON public.cdts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();