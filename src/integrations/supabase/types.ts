export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string
          account_type: string
          balance_bdh: number
          balance_ldh: number
          balance_pdh: number
          country_id: string | null
          created_at: string
          currency: string | null
          id: string
          monthly_fee: number
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          account_number: string
          account_type: string
          balance_bdh?: number
          balance_ldh?: number
          balance_pdh?: number
          country_id?: string | null
          created_at?: string
          currency?: string | null
          id: string
          monthly_fee?: number
          updated_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          account_number?: string
          account_type?: string
          balance_bdh?: number
          balance_ldh?: number
          balance_pdh?: number
          country_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          monthly_fee?: number
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_backings: {
        Row: {
          amount: number
          bank_id: string
          bank_type: string
          created_at: string
          currency_iso: string
          frozen: number
          id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_id: string
          bank_type: string
          created_at?: string
          currency_iso: string
          frozen?: number
          id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_id?: string
          bank_type?: string
          created_at?: string
          currency_iso?: string
          frozen?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_main_account: {
        Row: {
          account_number: string
          balance_bdh: number
          balance_ldh: number
          balance_pdh: number
          id: string
          updated_at: string
        }
        Insert: {
          account_number?: string
          balance_bdh?: number
          balance_ldh?: number
          balance_pdh?: number
          id?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          balance_bdh?: number
          balance_ldh?: number
          balance_pdh?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_settings: {
        Row: {
          business_loan_interest_rate: number
          business_transfer_commission: number
          cdt_rate_12w: number
          cdt_rate_24w: number
          cdt_rate_4w: number
          cdt_rate_8w: number
          deposit_commission: number
          id: string
          international_transfer_commission: number
          late_payment_penalty_rate: number
          personal_loan_interest_rate: number
          savings_weekly_interest_rate: number
          theme: string
          updated_at: string
        }
        Insert: {
          business_loan_interest_rate?: number
          business_transfer_commission?: number
          cdt_rate_12w?: number
          cdt_rate_24w?: number
          cdt_rate_4w?: number
          cdt_rate_8w?: number
          deposit_commission?: number
          id?: string
          international_transfer_commission?: number
          late_payment_penalty_rate?: number
          personal_loan_interest_rate?: number
          savings_weekly_interest_rate?: number
          theme?: string
          updated_at?: string
        }
        Update: {
          business_loan_interest_rate?: number
          business_transfer_commission?: number
          cdt_rate_12w?: number
          cdt_rate_24w?: number
          cdt_rate_4w?: number
          cdt_rate_8w?: number
          deposit_commission?: number
          id?: string
          international_transfer_commission?: number
          late_payment_penalty_rate?: number
          personal_loan_interest_rate?: number
          savings_weekly_interest_rate?: number
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      banknote_denominations: {
        Row: {
          boxes_printed: number
          created_at: string
          id: string
          national_bank_id: string
          updated_at: string
          value: number
        }
        Insert: {
          boxes_printed?: number
          created_at?: string
          id?: string
          national_bank_id: string
          updated_at?: string
          value: number
        }
        Update: {
          boxes_printed?: number
          created_at?: string
          id?: string
          national_bank_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "banknote_denominations_national_bank_id_fkey"
            columns: ["national_bank_id"]
            isOneToOne: false
            referencedRelation: "national_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      bond_holdings: {
        Row: {
          account_id: string
          bond_id: string
          coupons_paid: number
          created_at: string
          id: string
          last_coupon_at: string
          maturity_at: string
          principal_denom: number
          principal_pdh: number
          purchased_at: string
          status: string
          total_interest_pdh: number
          units: number
          updated_at: string
        }
        Insert: {
          account_id: string
          bond_id: string
          coupons_paid?: number
          created_at?: string
          id?: string
          last_coupon_at?: string
          maturity_at: string
          principal_denom: number
          principal_pdh: number
          purchased_at?: string
          status?: string
          total_interest_pdh?: number
          units: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          bond_id?: string
          coupons_paid?: number
          created_at?: string
          id?: string
          last_coupon_at?: string
          maturity_at?: string
          principal_denom?: number
          principal_pdh?: number
          purchased_at?: string
          status?: string
          total_interest_pdh?: number
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bond_holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bond_holdings_bond_id_fkey"
            columns: ["bond_id"]
            isOneToOne: false
            referencedRelation: "state_bonds"
            referencedColumns: ["id"]
          },
        ]
      }
      cdts: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: string
          early_withdrawal_penalty: number
          final_amount: number
          id: string
          interest_payout_frequency: string
          interest_rate: number
          is_indefinite: boolean
          maturity_date: string
          start_date: string
          status: string
          term_months: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency?: string
          early_withdrawal_penalty?: number
          final_amount: number
          id?: string
          interest_payout_frequency?: string
          interest_rate: number
          is_indefinite?: boolean
          maturity_date: string
          start_date?: string
          status?: string
          term_months: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: string
          early_withdrawal_penalty?: number
          final_amount?: number
          id?: string
          interest_payout_frequency?: string
          interest_rate?: number
          is_indefinite?: boolean
          maturity_date?: string
          start_date?: string
          status?: string
          term_months?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commodities: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          price_in_kyd: number
          trend: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          price_in_kyd?: number
          trend?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          price_in_kyd?: number
          trend?: string
          updated_at?: string
        }
        Relationships: []
      }
      commodity_deposits: {
        Row: {
          account_id: string
          commodity_id: string
          created_at: string
          currency_at_deposit: string
          id: string
          price_at_deposit: number
          status: string
          total_value_at_deposit: number
          units: number
          updated_at: string
        }
        Insert: {
          account_id: string
          commodity_id: string
          created_at?: string
          currency_at_deposit?: string
          id?: string
          price_at_deposit: number
          status?: string
          total_value_at_deposit: number
          units: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          commodity_id?: string
          created_at?: string
          currency_at_deposit?: string
          id?: string
          price_at_deposit?: number
          status?: string
          total_value_at_deposit?: number
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commodity_deposits_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          created_at: string
          currency_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          burned_amount: number
          created_at: string
          exchange_rate_to_pdh: number
          id: string
          initial_units_per_pdh: number
          is_fixed_rate: boolean
          iso_symbol: string
          name: string
          pdh_reserves: number
          printed_amount: number
          updated_at: string
        }
        Insert: {
          burned_amount?: number
          created_at?: string
          exchange_rate_to_pdh?: number
          id?: string
          initial_units_per_pdh?: number
          is_fixed_rate?: boolean
          iso_symbol: string
          name: string
          pdh_reserves?: number
          printed_amount?: number
          updated_at?: string
        }
        Update: {
          burned_amount?: number
          created_at?: string
          exchange_rate_to_pdh?: number
          id?: string
          initial_units_per_pdh?: number
          is_fixed_rate?: boolean
          iso_symbol?: string
          name?: string
          pdh_reserves?: number
          printed_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      loan_payments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          interest: number
          loan_id: string
          paid_date: string | null
          payment_number: number
          penalty: number
          principal: number
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          interest: number
          loan_id: string
          paid_date?: string | null
          payment_number: number
          penalty?: number
          principal: number
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          interest?: number
          loan_id?: string
          paid_date?: string | null
          payment_number?: number
          penalty?: number
          principal?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: string
          end_date: string | null
          id: string
          interest_rate: number
          monthly_payment: number
          outstanding_balance: number
          start_date: string | null
          status: string
          term_months: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          interest_rate: number
          monthly_payment: number
          outstanding_balance: number
          start_date?: string | null
          status?: string
          term_months: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          interest_rate?: number
          monthly_payment?: number
          outstanding_balance?: number
          start_date?: string | null
          status?: string
          term_months?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      national_bank_accounts: {
        Row: {
          account_number: string
          account_type: string
          backing_amount: number
          backing_currency: string | null
          balance_real: number
          balance_symbolic: number
          created_at: string
          holder_name: string
          id: string
          national_bank_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_number: string
          account_type?: string
          backing_amount?: number
          backing_currency?: string | null
          balance_real?: number
          balance_symbolic?: number
          created_at?: string
          holder_name: string
          id?: string
          national_bank_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_type?: string
          backing_amount?: number
          backing_currency?: string | null
          balance_real?: number
          balance_symbolic?: number
          created_at?: string
          holder_name?: string
          id?: string
          national_bank_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      national_bank_transactions: {
        Row: {
          amount_local: number
          backing_amount: number
          backing_currency: string | null
          counterparty_national_bank_id: string | null
          created_at: string
          currency_local: string | null
          description: string
          from_account_id: string | null
          id: string
          is_symbolic: boolean
          national_bank_id: string
          status: string
          to_account_id: string | null
          transaction_type: string
        }
        Insert: {
          amount_local?: number
          backing_amount?: number
          backing_currency?: string | null
          counterparty_national_bank_id?: string | null
          created_at?: string
          currency_local?: string | null
          description?: string
          from_account_id?: string | null
          id?: string
          is_symbolic?: boolean
          national_bank_id: string
          status?: string
          to_account_id?: string | null
          transaction_type: string
        }
        Update: {
          amount_local?: number
          backing_amount?: number
          backing_currency?: string | null
          counterparty_national_bank_id?: string | null
          created_at?: string
          currency_local?: string | null
          description?: string
          from_account_id?: string | null
          id?: string
          is_symbolic?: boolean
          national_bank_id?: string
          status?: string
          to_account_id?: string | null
          transaction_type?: string
        }
        Relationships: []
      }
      national_banks: {
        Row: {
          country_id: string
          created_at: string
          frozen_kyd: number
          frozen_pdh: number
          id: string
          kyd_reserve: number
          name: string
          pdh_reserve: number
          status: string
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          frozen_kyd?: number
          frozen_pdh?: number
          id?: string
          kyd_reserve?: number
          name: string
          pdh_reserve?: number
          status?: string
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          frozen_kyd?: number
          frozen_pdh?: number
          id?: string
          kyd_reserve?: number
          name?: string
          pdh_reserve?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_configs: {
        Row: {
          created_at: string
          currency: string
          employer_account_id: string
          frequency: string
          id: string
          is_active: boolean
          name: string
          next_payment_date: string | null
          pay_day: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          employer_account_id: string
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          next_payment_date?: string | null
          pay_day?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          employer_account_id?: string
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          next_payment_date?: string | null
          pay_day?: number
          updated_at?: string
        }
        Relationships: []
      }
      payroll_employees: {
        Row: {
          created_at: string
          employee_account_id: string
          id: string
          is_active: boolean
          payroll_id: string
          salary: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_account_id: string
          id?: string
          is_active?: boolean
          payroll_id: string
          salary?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_account_id?: string
          id?: string
          is_active?: boolean
          payroll_id?: string
          salary?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employees_employee_account_id_fkey"
            columns: ["employee_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employees_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          employee_account_id: string
          error_message: string | null
          id: string
          payment_date: string
          payroll_id: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          employee_account_id: string
          error_message?: string | null
          id?: string
          payment_date?: string
          payroll_id: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          employee_account_id?: string
          error_message?: string | null
          id?: string
          payment_date?: string
          payroll_id?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payments_employee_account_id_fkey"
            columns: ["employee_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payments_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      private_bank_accounts: {
        Row: {
          account_number: string
          balance_real: number
          balance_symbolic: number
          created_at: string
          holder: string
          id: string
          private_bank_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          account_number: string
          balance_real?: number
          balance_symbolic?: number
          created_at?: string
          holder: string
          id?: string
          private_bank_id: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          balance_real?: number
          balance_symbolic?: number
          created_at?: string
          holder?: string
          id?: string
          private_bank_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_bank_accounts_private_bank_id_fkey"
            columns: ["private_bank_id"]
            isOneToOne: false
            referencedRelation: "private_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      private_bank_transactions: {
        Row: {
          amount: number
          created_at: string
          currency_iso: string | null
          description: string | null
          fee: number
          from_account_id: string | null
          id: string
          money_source: string
          private_bank_id: string
          to_account_id: string | null
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency_iso?: string | null
          description?: string | null
          fee?: number
          from_account_id?: string | null
          id?: string
          money_source?: string
          private_bank_id: string
          to_account_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_iso?: string | null
          description?: string | null
          fee?: number
          from_account_id?: string | null
          id?: string
          money_source?: string
          private_bank_id?: string
          to_account_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_bank_transactions_private_bank_id_fkey"
            columns: ["private_bank_id"]
            isOneToOne: false
            referencedRelation: "private_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      private_banks: {
        Row: {
          cash_on_hand: number
          country_id: string
          created_at: string
          fee_deposit: number
          fee_transfer: number
          fee_withdrawal: number
          guarantor_active: boolean
          guarantor_frozen_kyd: number
          guarantor_source_account_id: string | null
          guarantor_source_type: string
          id: string
          kyd_reserve: number
          name: string
          national_bank_id: string
          pdh_reserve: number
          status: string
          updated_at: string
        }
        Insert: {
          cash_on_hand?: number
          country_id: string
          created_at?: string
          fee_deposit?: number
          fee_transfer?: number
          fee_withdrawal?: number
          guarantor_active?: boolean
          guarantor_frozen_kyd?: number
          guarantor_source_account_id?: string | null
          guarantor_source_type?: string
          id?: string
          kyd_reserve?: number
          name: string
          national_bank_id: string
          pdh_reserve?: number
          status?: string
          updated_at?: string
        }
        Update: {
          cash_on_hand?: number
          country_id?: string
          created_at?: string
          fee_deposit?: number
          fee_transfer?: number
          fee_withdrawal?: number
          guarantor_active?: boolean
          guarantor_frozen_kyd?: number
          guarantor_source_account_id?: string | null
          guarantor_source_type?: string
          id?: string
          kyd_reserve?: number
          name?: string
          national_bank_id?: string
          pdh_reserve?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_banks_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_banks_national_bank_id_fkey"
            columns: ["national_bank_id"]
            isOneToOne: false
            referencedRelation: "national_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      state_bonds: {
        Row: {
          annual_rate: number
          available_units: number
          created_at: string
          denom_currency: string
          denom_mode: string
          description: string | null
          id: string
          issued_at: string
          name: string
          national_bank_id: string
          status: string
          term_weeks: number
          total_units: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          annual_rate?: number
          available_units: number
          created_at?: string
          denom_currency: string
          denom_mode: string
          description?: string | null
          id?: string
          issued_at?: string
          name: string
          national_bank_id: string
          status?: string
          term_weeks: number
          total_units: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          annual_rate?: number
          available_units?: number
          created_at?: string
          denom_currency?: string
          denom_mode?: string
          description?: string | null
          id?: string
          issued_at?: string
          name?: string
          national_bank_id?: string
          status?: string
          term_weeks?: number
          total_units?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_bonds_national_bank_id_fkey"
            columns: ["national_bank_id"]
            isOneToOne: false
            referencedRelation: "national_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          commission: number | null
          commission_currency: string | null
          created_at: string
          currency: string
          description: string
          from_account_id: string | null
          from_account_number: string | null
          id: string
          to_account_id: string | null
          to_account_number: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          commission?: number | null
          commission_currency?: string | null
          created_at?: string
          currency: string
          description: string
          from_account_id?: string | null
          from_account_number?: string | null
          id: string
          to_account_id?: string | null
          to_account_number?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          commission?: number | null
          commission_currency?: string | null
          created_at?: string
          currency?: string
          description?: string
          from_account_id?: string | null
          from_account_number?: string | null
          id?: string
          to_account_id?: string | null
          to_account_number?: string | null
          transaction_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
