
CREATE TABLE public.bank_settings (
  id text PRIMARY KEY DEFAULT 'default',
  deposit_commission numeric NOT NULL DEFAULT 0.08,
  business_transfer_commission numeric NOT NULL DEFAULT 0.05,
  international_transfer_commission numeric NOT NULL DEFAULT 0.03,
  personal_loan_interest_rate numeric NOT NULL DEFAULT 15.0,
  business_loan_interest_rate numeric NOT NULL DEFAULT 12.0,
  late_payment_penalty_rate numeric NOT NULL DEFAULT 0.02,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on bank_settings" ON public.bank_settings FOR ALL TO anon USING (true) WITH CHECK (true);

INSERT INTO public.bank_settings (id) VALUES ('default');
