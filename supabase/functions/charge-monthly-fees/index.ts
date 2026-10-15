import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Account {
  id: string
  user_name: string
  account_number: string
  account_type: string
  balance_pdh: number
  monthly_fee: number
}

interface BankAccount {
  id: string
  balance_pdh: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    console.log('Starting monthly fee collection...')
    
    // Obtener todas las cuentas activas
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, user_name, account_number, account_type, balance_pdh, monthly_fee')
      .returns<Account[]>()
    
    if (accountsError) {
      console.error('Error fetching accounts:', accountsError)
      throw accountsError
    }
    
    if (!accounts || accounts.length === 0) {
      console.log('No accounts found')
      return new Response(
        JSON.stringify({ message: 'No accounts to charge fees', feesCharged: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Obtener cuenta principal del banco
    const { data: bankAccount, error: bankError } = await supabase
      .from('bank_main_account')
      .select('id, balance_pdh')
      .eq('id', 'bank-main')
      .single<BankAccount>()
    
    if (bankError || !bankAccount) {
      console.error('Error fetching bank account:', bankError)
      throw bankError
    }
    
    let totalFeesCollected = 0
    let successfulCharges = 0
    let failedCharges = 0
    const chargeResults = []
    
    // Procesar cada cuenta
    for (const account of accounts) {
      const fee = Number(account.monthly_fee)
      const currentBalance = Number(account.balance_pdh)
      
      if (fee <= 0) {
        console.log(`Account ${account.account_number} has no monthly fee`)
        continue
      }
      
      if (currentBalance < fee) {
        console.log(`Account ${account.account_number} has insufficient balance (${currentBalance} < ${fee})`)
        failedCharges++
        chargeResults.push({
          account: account.account_number,
          status: 'failed',
          reason: 'insufficient_balance',
          balance: currentBalance,
          fee: fee
        })
        continue
      }
      
      // Deducir tarifa de la cuenta del cliente
      const newAccountBalance = currentBalance - fee
      const { error: updateAccountError } = await supabase
        .from('accounts')
        .update({ balance_pdh: newAccountBalance })
        .eq('id', account.id)
      
      if (updateAccountError) {
        console.error(`Error updating account ${account.account_number}:`, updateAccountError)
        failedCharges++
        chargeResults.push({
          account: account.account_number,
          status: 'error',
          error: updateAccountError.message
        })
        continue
      }
      
      // Agregar tarifa a la cuenta del banco
      const newBankBalance = Number(bankAccount.balance_pdh) + fee
      const { error: updateBankError } = await supabase
        .from('bank_main_account')
        .update({ balance_pdh: newBankBalance })
        .eq('id', 'bank-main')
      
      if (updateBankError) {
        console.error(`Error updating bank account:`, updateBankError)
        // Revertir el cargo en la cuenta del cliente
        await supabase
          .from('accounts')
          .update({ balance_pdh: currentBalance })
          .eq('id', account.id)
        
        failedCharges++
        chargeResults.push({
          account: account.account_number,
          status: 'error',
          error: updateBankError.message
        })
        continue
      }
      
      // Actualizar balance del banco en memoria para el siguiente cargo
      bankAccount.balance_pdh = newBankBalance
      
      // Crear transacción de cuota
      const txnId = `FEE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const { error: txnError } = await supabase.from('transactions').insert({
        id: txnId,
        transaction_type: 'fee',
        from_account_id: account.id,
        from_account_number: account.account_number,
        to_account_id: 'bank-main',
        to_account_number: 'MAHR-BANK-000001',
        amount: fee,
        currency: 'PDH',
        description: `Cuota mensual - ${account.user_name} (${account.account_number})`,
      })
      
      if (txnError) {
        console.error(`Error creating transaction for ${account.account_number}:`, txnError)
      }
      
      totalFeesCollected += fee
      successfulCharges++
      chargeResults.push({
        account: account.account_number,
        status: 'success',
        fee: fee
      })
      
      console.log(`Charged ${fee} PDH from account ${account.account_number}`)
    }
    
    console.log(`Monthly fee collection complete. Total: ${totalFeesCollected} PDH from ${successfulCharges} accounts`)
    
    return new Response(
      JSON.stringify({
        message: 'Monthly fee collection completed',
        totalFeesCollected,
        successfulCharges,
        failedCharges,
        totalAccounts: accounts.length,
        results: chargeResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in charge-monthly-fees function:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
