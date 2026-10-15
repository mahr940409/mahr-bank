
ALTER TABLE public.transactions DROP CONSTRAINT transactions_transaction_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transaction_type_check 
  CHECK (transaction_type = ANY (ARRAY[
    'deposit', 'withdrawal', 'transfer', 'fee', 'commission',
    'cdt_creation', 'cdt_maturity', 'cdt_early_withdrawal', 'cdt_interest_payout',
    'loan_disbursement', 'loan_payment', 'capital_injection', 'payroll_payment',
    'commodity_purchase', 'commodity_sale'
  ]));
