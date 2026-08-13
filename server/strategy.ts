export type RiskInputs = {
  usdInr: number;
  maxTradeLossInr: number;
  profitTrailStartInr: number;
  profitTrailDrawdownInr: number;
};

export type PairPricing = {
  ceEntry: number;
  peEntry: number;
  ceMark: number;
  peMark: number;
  spot: number;
  lots: number;
};

export type PnlCalculation = {
  pnlUsd: number;
  pnlInr: number;
  feesInr: number;
  netInr: number;
};

export type ExitDecision = {
  action: "none" | "coupled_sl" | "max_loss" | "take_profit" | "profit_trail" | "time_exit";
  reason: string;
  shouldClose: boolean;
  nextProfitHighInr: number | null;
};

export function calculatePartialCloseLots(remainingLots: number, closePercent: 25 | 50 | 75 | 100) {
  const safeLots = Math.max(0, Math.trunc(remainingLots));
  if (!safeLots) return 0;
  if (closePercent === 100) return safeLots;
  return Math.max(1, Math.floor((safeLots * closePercent) / 100));
}

export function shouldCloseAtAutoProfitTarget(input: { exitMode: "manual" | "auto"; targetInr: number | null | undefined; netInr: number }) {
  return input.exitMode === "auto" && Number.isFinite(input.targetInr) && Number(input.targetInr) > 0 && input.netInr >= Number(input.targetInr);
}

export function calculatePairPnl(pricing: PairPricing, usdInr: number): PnlCalculation {
  const pnlUsd = ((pricing.ceEntry - pricing.ceMark) + (pricing.peEntry - pricing.peMark)) * 0.001 * pricing.lots;
  const fee = (premium: number) => Math.min(pricing.lots * 0.001 * pricing.spot * 0.0001, premium * 0.001 * pricing.lots * 0.035);
  const feesInr = (fee(pricing.ceEntry) + fee(pricing.peEntry) + fee(pricing.ceMark) + fee(pricing.peMark)) * 1.18 * usdInr;
  const pnlInr = pnlUsd * usdInr;
  return { pnlUsd, pnlInr, feesInr, netInr: pnlInr - feesInr };
}

function istClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? "0");
  return { hour: value("hour"), minute: value("minute") };
}

export function isOvernightProfitWindow(now: Date) {
  const { hour, minute } = istClock(now);
  const minutes = hour * 60 + minute;
  return minutes >= 60 && minutes < 180;
}

export function isAfterThreeAmIst(now: Date) {
  const { hour, minute } = istClock(now);
  return hour > 3 || (hour === 3 && minute >= 0);
}

export function evaluateExit(input: {
  pricing: PairPricing;
  pnl: PnlCalculation;
  risk: RiskInputs;
  manualHold: boolean;
  priorProfitHighInr: number | null;
  now?: Date;
}): ExitDecision {
  const now = input.now ?? new Date();
  const ceStop = input.pricing.ceEntry * 2;
  const peStop = input.pricing.peEntry * 2;
  const stopLegs = [input.pricing.ceMark >= ceStop ? "CE" : "", input.pricing.peMark >= peStop ? "PE" : ""].filter(Boolean);
  const inWindow = isOvernightProfitWindow(now);
  const nextProfitHighInr = inWindow ? Math.max(input.priorProfitHighInr ?? input.pnl.netInr, input.pnl.netInr) : input.priorProfitHighInr;

  if (stopLegs.length) {
    return { action: "coupled_sl", reason: `${stopLegs.join(" + ")} reached the 2× entry stop; close both legs.`, shouldClose: true, nextProfitHighInr };
  }
  if (input.risk.maxTradeLossInr > 0 && input.pnl.netInr <= -input.risk.maxTradeLossInr) {
    return { action: "max_loss", reason: `Net loss reached the configured maximum loss of INR ${input.risk.maxTradeLossInr.toFixed(2)}.`, shouldClose: true, nextProfitHighInr };
  }
  if (input.manualHold) {
    return { action: "none", reason: "Manual Hold suppresses bot take-profit, profit-trailing, and time exits.", shouldClose: false, nextProfitHighInr };
  }
  if (input.pricing.ceMark <= 20 && input.pricing.peMark <= 20) {
    return { action: "take_profit", reason: "Both option legs are at or below the $20 take-profit threshold.", shouldClose: true, nextProfitHighInr };
  }
  if (
    inWindow &&
    nextProfitHighInr !== null &&
    nextProfitHighInr >= input.risk.profitTrailStartInr &&
    nextProfitHighInr - input.pnl.netInr >= input.risk.profitTrailDrawdownInr
  ) {
    return {
      action: "profit_trail",
      reason: `Profit trailed from INR ${nextProfitHighInr.toFixed(2)} by INR ${(nextProfitHighInr - input.pnl.netInr).toFixed(2)}.`,
      shouldClose: true,
      nextProfitHighInr,
    };
  }
  if (isAfterThreeAmIst(now)) {
    return { action: "time_exit", reason: "03:00 IST hard time exit reached.", shouldClose: true, nextProfitHighInr };
  }
  return { action: "none", reason: "No automated exit condition is met.", shouldClose: false, nextProfitHighInr };
}
