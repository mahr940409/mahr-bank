ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'PDH';

UPDATE public.loans l
SET currency = COALESCE(a.currency, 'PDH')
FROM public.accounts a
WHERE l.account_id = a.id;