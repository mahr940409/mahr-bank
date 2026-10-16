-- Repara depósitos físicos históricos que se registraron antes del control
-- de custodia. No crea billetes: solo reconstruye dónde quedaron registrados.
INSERT INTO public.banknote_custody (bank_type, bank_id, denomination_id, quantity, updated_at)
SELECT
  'private',
  t.private_bank_id,
  d.id,
  SUM((j.value)::integer),
  now()
FROM public.private_bank_transactions t
JOIN public.private_banks b ON b.id = t.private_bank_id
JOIN LATERAL jsonb_each_text(COALESCE(t.denomination_breakdown, '{}'::jsonb)) j ON true
JOIN public.banknote_denominations d
  ON d.national_bank_id = b.national_bank_id
 AND d.value = (j.key)::numeric
WHERE t.type = 'deposit'
  AND t.money_source = 'printed'
  AND (j.value)::integer > 0
GROUP BY t.private_bank_id, d.id
ON CONFLICT (bank_type, bank_id, denomination_id)
DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
