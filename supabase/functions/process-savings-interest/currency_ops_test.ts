// Suite de pruebas: conversiones de moneda y comisiones
// Replica las fórmulas usadas en src/lib/bankOperations.ts, src/lib/currencyUtils.ts
// y las edge functions (process-savings-interest, charge-monthly-fees,
// process-cdt-interest). NO toca datos reales — todo es cálculo puro.
//
// Ejecutar con: supabase--test_edge_functions { functions: ["process-savings-interest"] }

import {
  assertEquals,
  assertAlmostEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------- Tasas de cambio sintéticas (currency_per_1_PDH) ----------
// Mismo formato que la columna currencies.exchange_rate_to_pdh
const RATES: Record<string, number> = {
  PDH: 1,
  KYD: 1,        // paridad fija 1:1
  LDH: 9,        // paridad fija
  BDH: 81,       // paridad fija
  USD: 0.4114567954757488,
  EUR: 0.4755514668524997,
  COP: 0.00012456270269012158,
  JPY: 0.010018045200289585,
};

// ---------- Helpers de conversión (espejo de currencyUtils.ts) ----------
function convertToPDH(amount: number, from: string): number {
  const r = RATES[from];
  if (!r) return amount;
  return amount * r;
}
function convertFromPDH(amount: number, to: string): number {
  const r = RATES[to];
  if (!r) return amount;
  return amount / r;
}
function convertCurrency(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  return convertFromPDH(convertToPDH(amount, from), to);
}

// ---------- Settings sintéticos (espejo de bank_settings) ----------
const SETTINGS = {
  depositCommission: 0.08,
  businessTransferCommission: 0.05,
  internationalTransferCommission: 0.03,
  savingsWeeklyInterestRate: 0.005,
  cdtRate24w: 0.10,
  cdtEarlyPenalty: 0.10,
};

// ===================================================================
// 1. CONVERSIONES DE MONEDA
// ===================================================================
Deno.test("convert: misma moneda devuelve el mismo monto", () => {
  assertEquals(convertCurrency(123.45, "USD", "USD"), 123.45);
});

Deno.test("convert: PDH ↔ KYD es 1:1", () => {
  assertEquals(convertCurrency(1000, "PDH", "KYD"), 1000);
  assertEquals(convertCurrency(1000, "KYD", "PDH"), 1000);
});

Deno.test("convert: LDH/BDH usan paridad fija", () => {
  assertEquals(convertToPDH(10, "LDH"), 90);   // 10 LDH = 90 PDH
  assertEquals(convertFromPDH(81, "BDH"), 1);  // 81 PDH = 1 BDH
});

Deno.test("convert: ida y vuelta preserva el monto (USD→PDH→USD)", () => {
  const original = 250;
  const roundTrip = convertFromPDH(convertToPDH(original, "USD"), "USD");
  assertAlmostEquals(roundTrip, original, 1e-9);
});

Deno.test("convert: USD → EUR pasa por PDH correctamente", () => {
  // 100 USD → PDH → EUR
  const pdh = 100 * RATES.USD;
  const eur = pdh / RATES.EUR;
  assertAlmostEquals(convertCurrency(100, "USD", "EUR"), eur, 1e-9);
});

Deno.test("convert: moneda desconocida actúa como 1:1 (fallback)", () => {
  assertEquals(convertToPDH(50, "ZZZ"), 50);
  assertEquals(convertFromPDH(50, "ZZZ"), 50);
});

// ===================================================================
// 2. DEPÓSITO — comisión 8%, monto neto en moneda de cuenta
// ===================================================================
function calcDeposit(amount: number, currency: string, accountCurrency: string) {
  const commission = amount * SETTINGS.depositCommission;
  const netAmount = amount - commission;
  const commissionInPDH = convertToPDH(commission, currency);
  const netInAccount = convertCurrency(netAmount, currency, accountCurrency);
  return { commission, netAmount, commissionInPDH, netInAccount };
}

Deno.test("deposit: comisión 8% se calcula correctamente en COP", () => {
  const r = calcDeposit(1_000_000, "COP", "COP");
  assertAlmostEquals(r.commission, 80_000, 1e-6);
  assertAlmostEquals(r.netAmount, 920_000, 1e-6);
  assertAlmostEquals(r.netInAccount, 920_000, 1e-6);
});

Deno.test("deposit: comisión convertida a PDH coincide con tasa", () => {
  const r = calcDeposit(1_000, "USD", "USD");
  assertAlmostEquals(r.commission, 80, 1e-9);
  assertAlmostEquals(r.commissionInPDH, 80 * RATES.USD, 1e-9);
});

Deno.test("deposit: depositar en USD a cuenta EUR convierte el neto", () => {
  const r = calcDeposit(1_000, "USD", "EUR");
  const expectedNetEUR = convertCurrency(920, "USD", "EUR");
  assertAlmostEquals(r.netInAccount, expectedNetEUR, 1e-9);
});

Deno.test("deposit: monto cero produce comisión cero", () => {
  const r = calcDeposit(0, "USD", "USD");
  assertEquals(r.commission, 0);
  assertEquals(r.netAmount, 0);
});

// ===================================================================
// 3. RETIRO — sin comisión, conversión a moneda de cuenta, valida saldo
// ===================================================================
function calcWithdrawal(balance: number, accountCurrency: string, amount: number, currency: string) {
  const amountInAccount = convertCurrency(amount, currency, accountCurrency);
  const ok = balance >= amountInAccount;
  return { ok, amountInAccount, newBalance: ok ? balance - amountInAccount : balance };
}

Deno.test("withdrawal: misma moneda descuenta exacto", () => {
  const r = calcWithdrawal(5000, "EUR", 1000, "EUR");
  assert(r.ok);
  assertEquals(r.newBalance, 4000);
});

Deno.test("withdrawal: distinta moneda convierte y descuenta", () => {
  const r = calcWithdrawal(10_000, "EUR", 100, "USD");
  const eurEquiv = convertCurrency(100, "USD", "EUR");
  assertAlmostEquals(r.amountInAccount, eurEquiv, 1e-9);
  assertAlmostEquals(r.newBalance, 10_000 - eurEquiv, 1e-9);
});

Deno.test("withdrawal: saldo insuficiente falla y no muta balance", () => {
  const r = calcWithdrawal(10, "USD", 1000, "USD");
  assert(!r.ok);
  assertEquals(r.newBalance, 10);
});

// ===================================================================
// 4. TRANSFERENCIA — comisión por tipo y país
// ===================================================================
function getTransferRate(fromType: "personal" | "business", isInternational: boolean): number {
  if (isInternational) return SETTINGS.internationalTransferCommission;
  if (fromType === "business") return SETTINGS.businessTransferCommission;
  return 0;
}

interface AcctLite {
  balance: number;
  currency: string;
  type: "personal" | "business";
  countryId?: string;
}

function calcTransfer(from: AcctLite, to: AcctLite, amount: number, currency: string) {
  const isInternational = !!(from.countryId && to.countryId && from.countryId !== to.countryId);
  const rate = getTransferRate(from.type, isInternational);
  const commission = amount * rate;
  const totalToDeduct = amount + commission;
  const totalInSender = convertCurrency(totalToDeduct, currency, from.currency);
  const ok = from.balance >= totalInSender;
  const amountInReceiver = convertCurrency(amount, currency, to.currency);
  const commissionInPDH = convertToPDH(commission, currency);
  return { isInternational, rate, commission, commissionInPDH, totalInSender, amountInReceiver, ok };
}

Deno.test("transfer: personal nacional → SIN comisión", () => {
  const a: AcctLite = { balance: 5000, currency: "USD", type: "personal", countryId: "co" };
  const b: AcctLite = { balance: 0, currency: "USD", type: "personal", countryId: "co" };
  const r = calcTransfer(a, b, 1000, "USD");
  assertEquals(r.commission, 0);
  assertEquals(r.totalInSender, 1000);
});

Deno.test("transfer: business nacional → 5% comisión", () => {
  const a: AcctLite = { balance: 5000, currency: "USD", type: "business", countryId: "co" };
  const b: AcctLite = { balance: 0, currency: "USD", type: "personal", countryId: "co" };
  const r = calcTransfer(a, b, 1000, "USD");
  assertAlmostEquals(r.commission, 50, 1e-9);
  assertAlmostEquals(r.totalInSender, 1050, 1e-9);
});

Deno.test("transfer: internacional → 3% comisión (incluso personal)", () => {
  const a: AcctLite = { balance: 5000, currency: "USD", type: "personal", countryId: "co" };
  const b: AcctLite = { balance: 0, currency: "EUR", type: "personal", countryId: "es" };
  const r = calcTransfer(a, b, 1000, "USD");
  assert(r.isInternational);
  assertAlmostEquals(r.rate, 0.03, 1e-9);
  assertAlmostEquals(r.commission, 30, 1e-9);
});

Deno.test("transfer: internacional con conversión USD→EUR", () => {
  const a: AcctLite = { balance: 100_000, currency: "USD", type: "personal", countryId: "co" };
  const b: AcctLite = { balance: 0, currency: "EUR", type: "personal", countryId: "es" };
  const r = calcTransfer(a, b, 1000, "USD");
  // El receptor recibe el monto (sin comisión) convertido a EUR
  assertAlmostEquals(r.amountInReceiver, convertCurrency(1000, "USD", "EUR"), 1e-9);
  // El emisor paga monto+comisión en USD (su misma moneda)
  assertAlmostEquals(r.totalInSender, 1030, 1e-9);
  // La comisión en PDH es coherente
  assertAlmostEquals(r.commissionInPDH, 30 * RATES.USD, 1e-9);
});

Deno.test("transfer: saldo justo permite la operación", () => {
  const a: AcctLite = { balance: 1050, currency: "USD", type: "business", countryId: "co" };
  const b: AcctLite = { balance: 0, currency: "USD", type: "personal", countryId: "co" };
  const r = calcTransfer(a, b, 1000, "USD");
  assert(r.ok);
});

Deno.test("transfer: saldo 1 unidad por debajo falla", () => {
  const a: AcctLite = { balance: 1049.99, currency: "USD", type: "business", countryId: "co" };
  const b: AcctLite = { balance: 0, currency: "USD", type: "personal", countryId: "co" };
  const r = calcTransfer(a, b, 1000, "USD");
  assert(!r.ok);
});

// ===================================================================
// 5. INTERÉS DE AHORRO — espejo de process-savings-interest
// ===================================================================
Deno.test("savings interest: cuenta COP recibe interés en COP local", () => {
  const balancePDH = 4_377_060_923.16;
  const interestPDH = Math.round(balancePDH * SETTINGS.savingsWeeklyInterestRate * 100) / 100;
  const interestLocal = Math.round((interestPDH / RATES.COP) * 100) / 100;
  assertAlmostEquals(interestPDH, 21885304.62, 0.01);
  assert(interestLocal > 0);
  // Debe ser ~ balance_local * rate (tolerancia: 2 décimas por cada PDH redondeado)
  const balanceLocal = balancePDH / RATES.COP;
  const expected = balanceLocal * SETTINGS.savingsWeeklyInterestRate;
  // Error relativo < 1e-6 es aceptable (redondeo PDH a 2 decimales antes de convertir)
  const relError = Math.abs(interestLocal - expected) / expected;
  assert(relError < 1e-6, `Error relativo ${relError} demasiado grande`);
});

Deno.test("savings interest: balance < umbral no genera interés", () => {
  const balancePDH = 0.5;
  const interestPDH = Math.round(balancePDH * SETTINGS.savingsWeeklyInterestRate * 100) / 100;
  assert(interestPDH < 0.01);
});

// ===================================================================
// 6. CDT — penalización de retiro anticipado
// ===================================================================
Deno.test("cdt: penalización 10% sobre intereses acumulados al retiro temprano", () => {
  const principal = 10_000;
  const accruedInterest = 800;
  const penalty = accruedInterest * SETTINGS.cdtEarlyPenalty;
  const finalAmount = principal + accruedInterest - penalty;
  assertEquals(penalty, 80);
  assertEquals(finalAmount, 10_720);
});

// ===================================================================
// 7. INVARIANTES GLOBALES (conservación de valor en PDH)
// ===================================================================
Deno.test("invariante: depósito conserva valor en PDH (cuenta + comisión = entrada)", () => {
  const amount = 1000;
  const currency = "USD";
  const r = calcDeposit(amount, currency, "EUR");
  const inputPDH = convertToPDH(amount, currency);
  const accountGainPDH = convertToPDH(r.netInAccount, "EUR");
  const totalOutPDH = accountGainPDH + r.commissionInPDH;
  assertAlmostEquals(totalOutPDH, inputPDH, 1e-6);
});

Deno.test("invariante: transferencia conserva valor en PDH", () => {
  const a: AcctLite = { balance: 100_000, currency: "USD", type: "business", countryId: "co" };
  const b: AcctLite = { balance: 0, currency: "EUR", type: "personal", countryId: "es" };
  const r = calcTransfer(a, b, 1000, "USD");
  const senderLossPDH = convertToPDH(r.totalInSender, "USD");
  const receiverGainPDH = convertToPDH(r.amountInReceiver, "EUR");
  assertAlmostEquals(senderLossPDH, receiverGainPDH + r.commissionInPDH, 1e-6);
});
