-- Enable RLS on loans table
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- Enable RLS on loan_payments table
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

-- Policy for loans table - allow all operations
CREATE POLICY "Allow all operations on loans"
ON public.loans
FOR ALL
USING (true)
WITH CHECK (true);

-- Policy for loan_payments table - allow all operations
CREATE POLICY "Allow all operations on loan_payments"
ON public.loan_payments
FOR ALL
USING (true)
WITH CHECK (true);