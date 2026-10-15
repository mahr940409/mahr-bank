CREATE TABLE public.loans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  interest_rate NUMERIC NOT NULL,
  term_months INTEGER NOT NULL,
  monthly_payment NUMERIC NOT NULL,
  outstanding_balance NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.loan_payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  loan_id TEXT NOT NULL,
  payment_number INTEGER NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  amount NUMERIC NOT NULL,
  principal NUMERIC NOT NULL,
  interest NUMERIC NOT NULL,
  penalty NUMERIC NOT NULL DEFAULT 0,
  paid_date TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;