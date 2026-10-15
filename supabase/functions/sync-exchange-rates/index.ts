import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXTERNAL_API =
  "https://dpmlorhmpevsvxskjnhp.supabase.co/functions/v1/api?resource=countries";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for action
    let action = "sync"; // default: just sync rates
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
    } catch {
      // no body or invalid JSON, use default
    }

    // 1. Fetch external countries
    const extRes = await fetch(EXTERNAL_API);
    if (!extRes.ok) throw new Error(`External API error: ${extRes.status}`);
    const extData = await extRes.json();
    const externalCountries: Array<{
      name: string;
      currency_name: string;
      currency_code: string;
      is_fiat: boolean;
      exchange_rate_to_kyd: number;
    }> = extData.countries ?? [];

    // Get existing data
    const { data: existingCurrencies, error: curErr } = await supabase
      .from("currencies")
      .select("id, iso_symbol, exchange_rate_to_pdh, is_fixed_rate, name");
    if (curErr) throw curErr;

    const { data: existingCountries, error: countryErr } = await supabase
      .from("countries")
      .select("id, name, currency_id");
    if (countryErr) throw countryErr;

    const currencyBySymbol = new Map<string, { id: string; exchange_rate_to_pdh: number; is_fixed_rate: boolean }>();
    for (const c of existingCurrencies ?? []) {
      currencyBySymbol.set(c.iso_symbol, c);
    }

    const countryByName = new Map<string, string>();
    for (const c of existingCountries ?? []) {
      countryByName.set(c.name.toLowerCase(), c.id);
    }

    const imported = { currencies: 0, countries: 0 };
    const rateUpdates: Array<{ symbol: string; oldRate: number; newRate: number }> = [];

    for (const ext of externalCountries) {
      // Skip non-FIAT (KYD is fixed)
      if (!ext.is_fiat) continue;
      if (ext.exchange_rate_to_kyd <= 0) continue;

      const newRateToPDH = 1 / ext.exchange_rate_to_kyd;

      // --- Currency: create if missing ---
      let currencyId: string;
      const existing = currencyBySymbol.get(ext.currency_code);

      if (existing) {
        currencyId = existing.id;

        // Update rate if variable
        if (!existing.is_fixed_rate && Math.abs(newRateToPDH - existing.exchange_rate_to_pdh) > 0.0000001) {
          const { error: upErr } = await supabase
            .from("currencies")
            .update({ exchange_rate_to_pdh: newRateToPDH })
            .eq("id", currencyId);
          if (!upErr) {
            rateUpdates.push({ symbol: ext.currency_code, oldRate: existing.exchange_rate_to_pdh, newRate: newRateToPDH });
          }
        }
      } else if (action === "import") {
        // Create new currency
        const { data: newCur, error: insErr } = await supabase
          .from("currencies")
          .insert({
            name: ext.currency_name,
            iso_symbol: ext.currency_code,
            exchange_rate_to_pdh: newRateToPDH,
            is_fixed_rate: false,
          })
          .select("id")
          .single();
        if (insErr) {
          console.error(`Failed to create currency ${ext.currency_code}:`, insErr.message);
          continue;
        }
        currencyId = newCur.id;
        currencyBySymbol.set(ext.currency_code, { id: currencyId, exchange_rate_to_pdh: newRateToPDH, is_fixed_rate: false });
        imported.currencies++;
      } else {
        continue; // sync mode: skip unknown currencies
      }

      // --- Country: create if missing (only in import mode) ---
      if (action === "import" && !countryByName.has(ext.name.toLowerCase())) {
        const { error: cInsErr } = await supabase
          .from("countries")
          .insert({ name: ext.name, currency_id: currencyId });
        if (!cInsErr) {
          countryByName.set(ext.name.toLowerCase(), "new");
          imported.countries++;
        } else {
          console.error(`Failed to create country ${ext.name}:`, cInsErr.message);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        ratesUpdated: rateUpdates.length,
        rateDetails: rateUpdates,
        imported,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
