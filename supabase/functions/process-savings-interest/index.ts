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

    // Get savings interest rate from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from("bank_settings")
      .select("savings_weekly_interest_rate")
      .eq("id", "default")
      .single();

    if (settingsError || !settingsData) {
      return new Response(
        JSON.stringify({ error: "No se pudo obtener la configuración" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const weeklyRate = Number(settingsData.savings_weekly_interest_rate);
    if (weeklyRate <= 0) {
      return new Response(
        JSON.stringify({ message: "Tasa de interés semanal es 0, no hay intereses que procesar", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load exchange rates (rate = currency per 1 PDH; PDH amount / rate = currency amount)
    const { data: currenciesData } = await supabase
      .from("currencies")
      .select("iso_symbol, exchange_rate_to_pdh");
    const rates: Record<string, number> = { PDH: 1, BDH: 81, LDH: 9, KYD: 1 };
    (currenciesData ?? []).forEach((c: any) => {
      rates[c.iso_symbol] = Number(c.exchange_rate_to_pdh);
    });

    // Get all accounts with positive balance (exclude bank-main)
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, account_number, user_name, balance_pdh, currency")
      .gt("balance_pdh", 0);

    if (accountsError) {
      return new Response(
        JSON.stringify({ error: "Error al obtener cuentas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No hay cuentas con saldo positivo", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      const balancePDH = Number(account.balance_pdh);
      const interestPDH = Math.round(balancePDH * weeklyRate * 100) / 100;

      if (interestPDH < 0.01) continue;

      const accountCurrency = account.currency || "PDH";
      const rate = rates[accountCurrency] || 1;
      const interestLocal = Math.round((interestPDH / rate) * 100) / 100;
      const balanceLocal = Math.round((balancePDH / rate) * 100) / 100;

      // Update account balance (stored in PDH)
      const newBalance = balancePDH + interestPDH;
      const { error: updateError } = await supabase
        .from("accounts")
        .update({ balance_pdh: newBalance })
        .eq("id", account.id);

      if (updateError) {
        errors.push(`Error actualizando cuenta ${account.account_number}: ${updateError.message}`);
        continue;
      }

      // Record transaction in account's local currency
      const txId = crypto.randomUUID();
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          id: txId,
          transaction_type: "savings_interest",
          to_account_id: account.id,
          to_account_number: account.account_number,
          amount: interestLocal,
          currency: accountCurrency,
          description: `Interés semanal de ahorro (${(weeklyRate * 100).toFixed(2)}%) sobre saldo de ${balanceLocal.toFixed(2)} ${accountCurrency} - ${account.user_name}`,
        });

      if (txError) {
        errors.push(`Error registrando transacción para ${account.account_number}: ${txError.message}`);
      }

      processed++;
    }

    return new Response(
      JSON.stringify({
        message: `Intereses de ahorro procesados: ${processed} cuentas`,
        processed,
        rate: `${(weeklyRate * 100).toFixed(2)}%`,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
