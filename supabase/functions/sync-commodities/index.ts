import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXTERNAL_API =
  "https://dpmlorhmpevsvxskjnhp.supabase.co/functions/v1/api?resource=commodities";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch external commodities
    const extRes = await fetch(EXTERNAL_API);
    if (!extRes.ok) throw new Error(`External API error: ${extRes.status}`);
    const extData = await extRes.json();
    const commodities: Array<{
      name: string;
      code: string;
      price_in_kyd: number;
      trend: string;
    }> = extData.commodities ?? [];

    const results: Array<{ code: string; price: number; action: string }> = [];

    for (const c of commodities) {
      // KYD has 1:1 parity with PDH
      const priceInPDH = c.price_in_kyd;

      // Check if exists
      const { data: existing } = await supabase
        .from("commodities")
        .select("id, price_in_kyd")
        .eq("code", c.code)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("commodities")
          .update({
            price_in_kyd: priceInPDH,
            trend: c.trend,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        results.push({ code: c.code, price: priceInPDH, action: "updated" });
      } else {
        await supabase.from("commodities").insert({
          name: c.name,
          code: c.code,
          price_in_kyd: priceInPDH,
          trend: c.trend,
        });
        results.push({ code: c.code, price: priceInPDH, action: "created" });
      }
    }

    return new Response(
      JSON.stringify({ success: true, commodities: results }),
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
