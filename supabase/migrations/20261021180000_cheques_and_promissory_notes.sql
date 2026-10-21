CREATE TABLE IF NOT EXISTS public.cheques (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cheque_number text NOT NULL UNIQUE DEFAULT ('CHQ-' || floor(random() * 900000000 + 100000000)::text),
  cheque_type text NOT NULL CHECK (cheque_type IN ('personal', 'bank')),
  issuer_account_id text,
  issuer_bank_type text CHECK (issuer_bank_type IN ('national', 'private', 'mahr')),
  issuer_bank_id text,
  payee_name text NOT NULL,
  payee_account_id text,
  currency_iso text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'presented', 'paid', 'rejected', 'cancelled')),
  frozen_amount numeric NOT NULL DEFAULT 0 CHECK (frozen_amount >= 0),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  presented_at timestamptz,
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.promissory_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  note_number text NOT NULL UNIQUE DEFAULT ('PAG-' || floor(random() * 900000000 + 100000000)::text),
  issuer_account_id text,
  issuer_bank_type text CHECK (issuer_bank_type IN ('national', 'private', 'mahr')),
  issuer_bank_id text,
  beneficiary_name text NOT NULL,
  beneficiary_account_id text,
  currency_iso text NOT NULL,
  principal numeric NOT NULL CHECK (principal > 0),
  interest_rate numeric NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'accepted', 'paid', 'defaulted', 'cancelled')),
  outstanding numeric NOT NULL CHECK (outstanding >= 0),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promissory_notes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cheques' AND policyname='authenticated_manage_cheques') THEN
    CREATE POLICY authenticated_manage_cheques ON public.cheques FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promissory_notes' AND policyname='authenticated_manage_promissory_notes') THEN
    CREATE POLICY authenticated_manage_promissory_notes ON public.promissory_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheques, public.promissory_notes TO authenticated;
