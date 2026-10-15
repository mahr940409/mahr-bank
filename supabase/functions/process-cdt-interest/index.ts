import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active CDTs with daily or weekly payout
    const { data: cdts, error: cdtError } = await supabase
      .from("cdts")
      .select("*")
      .eq("status", "active")
      .in("interest_payout_frequency", ["daily", "weekly"]);

    if (cdtError) throw cdtError;
    if (!cdts || cdts.length === 0) {
      return new Response(JSON.stringify({ message: "No CDTs to process", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let processed = 0;
    const errors: string[] = [];

    for (const cdt of cdts) {
      try {
        const frequency = cdt.interest_payout_frequency;
        const annualRate = cdt.interest_rate;
        const amount = cdt.amount;

        // Calculate interest based on frequency
        let interestAmount: number;
        if (frequency === "daily") {
          interestAmount = amount * (annualRate / 365);
        } else if (frequency === "weekly") {
          const startDate = new Date(cdt.start_date);
          const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceStart % 7 !== 0 && daysSinceStart > 0) {
            continue;
          }
          interestAmount = amount * (annualRate / 52);
        } else {
          continue;
        }

        if (interestAmount <= 0) continue;

        interestAmount = Math.round(interestAmount * 100) / 100;

        // Get the account
        const { data: account, error: accError } = await supabase
          .from("accounts")
          .select("balance_pdh, account_number, user_name")
          .eq("id", cdt.account_id)
          .single();

        if (accError || !account) {
          errors.push(`Account ${cdt.account_id} not found for CDT ${cdt.id}`);
          continue;
        }

        // Credit interest to account
        const newBalance = account.balance_pdh + interestAmount;
        const { error: updateError } = await supabase
          .from("accounts")
          .update({ balance_pdh: newBalance })
          .eq("id", cdt.account_id);

        if (updateError) {
          errors.push(`Failed to update balance for CDT ${cdt.id}: ${updateError.message}`);
          continue;
        }

        // Record transaction
        const txId = crypto.randomUUID();
        const freqLabel = frequency === "daily" ? "diario" : "semanal";
        const { error: txError } = await supabase.from("transactions").insert({
          id: txId,
          transaction_type: "cdt_interest_payout",
          to_account_id: cdt.account_id,
          to_account_number: account.account_number,
          amount: interestAmount,
          currency: "PDH",
          description: `Pago de interes ${freqLabel} CDT - Capital: ${amount} ${cdt.currency} al ${(annualRate * 100).toFixed(1)}% anual - ${account.user_name}`,
        });

        if (txError) {
          errors.push(`Failed to record transaction for CDT ${cdt.id}: ${txError.message}`);
        }

        processed++;
      } catch (e) {
        errors.push(`Error processing CDT ${cdt.id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ message: "CDT interest processing complete", processed, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
