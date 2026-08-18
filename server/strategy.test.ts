import { describe, expect, it } from "vitest";
import { calculatePairPnl, calculatePartialCloseLots, evaluateExit, isThreeAmIstExitDue, shouldCloseAtAutoProfitTarget } from "./strategy";

const pricing = { ceEntry: 100, peEntry: 100, ceMark: 95, peMark: 95, spot: 65_000, lots: 120 };
const risk = { usdInr: 83, maxTradeLossInr: 1_200, profitTrailStartInr: 600, profitTrailDrawdownInr: 300 };
const overnightWindow = new Date("2026-08-10T20:00:00.000Z"); // 01:30 IST
const threeAm = new Date("2026-08-10T21:30:00.000Z"); // 03:00 IST

describe("TMT exit policy", () => {
  it("calculates seller P&L and fees from the two legs", () => {
    const pnl = calculatePairPnl(pricing, 83);
    expect(pnl.pnlUsd).toBeCloseTo(1.2);
    expect(pnl.pnlInr).toBeCloseTo(99.6);
    expect(pnl.feesInr).toBeGreaterThan(0);
  });

  it("applies the explicit Gold/XAUT contract value while retaining the same coupled-stop policy", () => {
    const goldPricing = { ceEntry: 82, peEntry: 61, ceMark: 164, peMark: 52, spot: 4_300, lots: 120, contractValue: 0.001 };
    const goldPnl = calculatePairPnl(goldPricing, 83);
    expect(goldPnl.pnlUsd).toBeCloseTo(-8.76);
    const decision = evaluateExit({ pricing: goldPricing, pnl: goldPnl, risk, manualHold: false, priorProfitHighInr: null, now: overnightWindow });
    expect(decision).toMatchObject({ action: "coupled_sl", shouldClose: true });
  });

  it("closes both legs on a coupled 2× stop even when Manual Hold is enabled", () => {
    const decision = evaluateExit({ pricing: { ...pricing, ceMark: 200 }, pnl: calculatePairPnl({ ...pricing, ceMark: 200 }, 83), risk, manualHold: true, priorProfitHighInr: null, now: overnightWindow });
    expect(decision).toMatchObject({ action: "coupled_sl", shouldClose: true });
  });

  it("closes on maximum configured loss even when Manual Hold is enabled", () => {
    const lossPricing = { ...pricing, ceMark: 175, peMark: 175 };
    const decision = evaluateExit({ pricing: lossPricing, pnl: calculatePairPnl(lossPricing, 83), risk, manualHold: true, priorProfitHighInr: null, now: overnightWindow });
    expect(decision).toMatchObject({ action: "max_loss", shouldClose: true });
  });

  it("suppresses take-profit and 03:00 time exits while Manual Hold is enabled", () => {
    const takeProfitPricing = { ...pricing, ceMark: 20, peMark: 20 };
    const takeProfit = evaluateExit({ pricing: takeProfitPricing, pnl: calculatePairPnl(takeProfitPricing, 83), risk, manualHold: true, priorProfitHighInr: null, now: overnightWindow });
    expect(takeProfit).toMatchObject({ action: "none", shouldClose: false });
    const timeExit = evaluateExit({ pricing, pnl: calculatePairPnl(pricing, 83), risk, manualHold: true, priorProfitHighInr: null, now: threeAm });
    expect(timeExit).toMatchObject({ action: "none", shouldClose: false });
  });

  it("does not treat 23:57 IST as after the following 03:00 IST exit", () => {
    const adoptedAt = new Date("2026-08-10T18:27:00.000Z"); // 23:57 IST
    const beforeMidnight = new Date("2026-08-10T18:28:00.000Z"); // 23:58 IST
    const afterFirstThreeAm = new Date("2026-08-10T21:31:00.000Z"); // 03:01 IST the next day
    expect(isThreeAmIstExitDue(beforeMidnight, adoptedAt)).toBe(false);
    expect(isThreeAmIstExitDue(afterFirstThreeAm, adoptedAt)).toBe(true);
    const decision = evaluateExit({ pricing, pnl: calculatePairPnl(pricing, 83), risk, manualHold: false, priorProfitHighInr: null, positionOpenedAt: adoptedAt, now: beforeMidnight });
    expect(decision).toMatchObject({ action: "none", shouldClose: false });
  });

  it("applies both-legs take profit and intrawindow profit trailing when Manual Hold is disabled", () => {
    const takeProfitPricing = { ...pricing, ceMark: 20, peMark: 20 };
    const takeProfit = evaluateExit({ pricing: takeProfitPricing, pnl: calculatePairPnl(takeProfitPricing, 83), risk, manualHold: false, priorProfitHighInr: null, now: overnightWindow });
    expect(takeProfit).toMatchObject({ action: "take_profit", shouldClose: true });

    const trailPricing = { ...pricing, ceMark: 60, peMark: 60 };
    const trailing = evaluateExit({ pricing: trailPricing, pnl: { pnlUsd: 10, pnlInr: 830, feesInr: 0, netInr: 350 }, risk, manualHold: false, priorProfitHighInr: 700, now: overnightWindow });
    expect(trailing).toMatchObject({ action: "profit_trail", shouldClose: true, nextProfitHighInr: 700 });
  });

  it("calculates bounded paired partial-close quantities for every supported percentage", () => {
    expect(calculatePartialCloseLots(120, 25)).toBe(30);
    expect(calculatePartialCloseLots(120, 50)).toBe(60);
    expect(calculatePartialCloseLots(120, 75)).toBe(90);
    expect(calculatePartialCloseLots(120, 100)).toBe(120);
    expect(calculatePartialCloseLots(3, 25)).toBe(1);
    expect(calculatePartialCloseLots(0, 100)).toBe(0);
  });

  it("closes at a positive Auto INR target only when Auto mode is active", () => {
    expect(shouldCloseAtAutoProfitTarget({ exitMode: "auto", targetInr: 600, netInr: 600 })).toBe(true);
    expect(shouldCloseAtAutoProfitTarget({ exitMode: "auto", targetInr: 600, netInr: 599.99 })).toBe(false);
    expect(shouldCloseAtAutoProfitTarget({ exitMode: "manual", targetInr: 600, netInr: 900 })).toBe(false);
    expect(shouldCloseAtAutoProfitTarget({ exitMode: "auto", targetInr: 0, netInr: 900 })).toBe(false);
  });
});
