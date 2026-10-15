
ALTER TABLE public.accounts ADD COLUMN country_id text REFERENCES public.countries(id);
ALTER TABLE public.accounts ADD COLUMN currency text DEFAULT 'PDH';
