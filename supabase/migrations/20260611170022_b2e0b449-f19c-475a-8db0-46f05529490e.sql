
CREATE TABLE public.state_bonds (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  national_bank_id text NOT NULL REFERENCES public.national_banks(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  denom_mode text NOT NULL CHECK (denom_mode IN ('local','pdh','kyd')),
  denom_currency text NOT NULL,
  unit_price numeric NOT NULL CHECK (unit_price > 0),
  total_units numeric NOT NULL CHECK (total_units > 0),
  available_units numeric NOT NULL,
  annual_rate numeric NOT NULL DEFAULT 0,
  term_weeks integer NOT NULL CHECK (term_weeks > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','repurchased')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_bonds TO anon, authenticated;
GRANT ALL ON public.state_bonds TO service_role;
ALTER TABLE public.state_bonds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on state_bonds" ON public.state_bonds FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_state_bonds_updated_at BEFORE UPDATE ON public.state_bonds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bond_holdings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bond_id text NOT NULL REFERENCES public.state_bonds(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  units numeric NOT NULL CHECK (units > 0),
  principal_pdh numeric NOT NULL,
  principal_denom numeric NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  maturity_at timestamptz NOT NULL,
  last_coupon_at timestamptz NOT NULL DEFAULT now(),
  coupons_paid integer NOT NULL DEFAULT 0,
  total_interest_pdh numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','matured','repurchased')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bond_holdings TO anon, authenticated;
GRANT ALL ON public.bond_holdings TO service_role;
ALTER TABLE public.bond_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on bond_holdings" ON public.bond_holdings FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_bond_holdings_updated_at BEFORE UPDATE ON public.bond_holdings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_bond_holdings_bond ON public.bond_holdings(bond_id);
CREATE INDEX idx_bond_holdings_account ON public.bond_holdings(account_id);
CREATE INDEX idx_state_bonds_bank ON public.state_bonds(national_bank_id);
