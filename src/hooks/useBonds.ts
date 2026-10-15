import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  StateBond, BondHolding,
  createBond, deleteBond, setBondStatus, buyBond,
  processCoupons, repurchaseHolding,
} from '@/lib/bondOperations';

export function useBonds() {
  const [bonds, setBonds] = useState<StateBond[]>([]);
  const [holdings, setHoldings] = useState<BondHolding[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, h] = await Promise.all([
      supabase.from('state_bonds').select('*').order('created_at', { ascending: false }),
      supabase.from('bond_holdings').select('*').order('created_at', { ascending: false }),
    ]);
    if (b.data) setBonds(b.data as unknown as StateBond[]);
    if (h.data) setHoldings(h.data as unknown as BondHolding[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return {
    bonds, holdings, loading, reload: load,
    createBond: async (args: Parameters<typeof createBond>[0]) => { await createBond(args); await load(); },
    deleteBond: async (id: string) => { await deleteBond(id); await load(); },
    setBondStatus: async (id: string, s: any) => { await setBondStatus(id, s); await load(); },
    buyBond: async (args: Parameters<typeof buyBond>[0]) => { await buyBond(args); await load(); },
    processCoupons: async (bankId?: string) => { const r = await processCoupons(bankId); await load(); return r; },
    repurchaseHolding: async (id: string) => { await repurchaseHolding(id); await load(); },
  };
}
