import { afterEach, describe, expect, it, vi } from "vitest";
import { nextIstOptionExpiryStamp, selectScheduledBtcStrangle } from "./delta";
import { assertDemoScheduledEntryArmed, getScheduledEntryTime, isScheduledEntryTriggerDue } from "./scheduled-entry";

const originalFetch = global.fetch;

afterEach(() => { global.fetch = originalFetch; });

describe("scheduled demo entry safeguards", () => {
  it("opens a narrow weekday 10:00 PM IST window and rejects weekend or late-window execution", () => {
    expect(getScheduledEntryTime(new Date("2026-08-17T16:30:00.000Z"))).toMatchObject({ istTradeDate: "2026-08-17", weekday: 1, hour: 22, minute: 0, due: true });
    expect(getScheduledEntryTime(new Date("2026-08-17T16:35:00.000Z"))).toMatchObject({ hour: 22, minute: 5, due: false });
    expect(getScheduledEntryTime(new Date("2026-08-15T16:30:00.000Z"))).toMatchObject({ weekday: 6, due: false });
  });

  it("evaluates independent 09:30 AM and 10:00 PM IST trigger times", () => {
    const morning = new Date("2026-08-17T04:00:00.000Z");
    expect(isScheduledEntryTriggerDue({ timeIst: "09:30", weekdays: "1,2,3,4,5", now: morning })).toMatchObject({ istTradeDate: "2026-08-17", due: true });
    expect(isScheduledEntryTriggerDue({ timeIst: "22:00", weekdays: "1,2,3,4,5", now: morning })).toMatchObject({ due: false });
  });

  it("requires both the account and server demo-entry gates, never accepting a live credential", () => {
    const safe = { enabled: true, manualOnlyMode: false, credentialMode: "demo" as const, serverEnabled: true, serverAcknowledgement: "I_ACCEPT_DEMO_SCHEDULED_ENTRY_RISK", expectedAcknowledgement: "I_ACCEPT_DEMO_SCHEDULED_ENTRY_RISK" };
    expect(() => assertDemoScheduledEntryArmed(safe)).not.toThrow();
    expect(() => assertDemoScheduledEntryArmed({ ...safe, credentialMode: "live" })).toThrow("demo-only");
    expect(() => assertDemoScheduledEntryArmed({ ...safe, serverEnabled: false })).toThrow("server-side");
  });

  it("selects next-day BTC CE and PE candidates nearest the premium target from live sellable bids", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [
        { id: 11, symbol: "C-BTC-65000-180826", state: "live" }, { id: 12, symbol: "C-BTC-66000-180826", state: "live" },
        { id: 21, symbol: "P-BTC-64000-180826", state: "live" }, { id: 22, symbol: "P-BTC-63000-180826", state: "live" },
        { id: 31, symbol: "C-BTC-65000-170826", state: "live" },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [
        { symbol: "C-BTC-65000-180826", product_id: 11, mark_price: "103", quotes: { best_bid: "102" } },
        { symbol: "C-BTC-66000-180826", product_id: 12, mark_price: "99", quotes: { best_bid: "98" } },
        { symbol: "P-BTC-64000-180826", product_id: 21, mark_price: "101", quotes: { best_bid: "100" } },
        { symbol: "P-BTC-63000-180826", product_id: 22, mark_price: "96", quotes: { best_bid: "95" } },
      ] }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const now = new Date("2026-08-17T16:30:00.000Z");
    expect(nextIstOptionExpiryStamp(now)).toBe("180826");
    await expect(selectScheduledBtcStrangle({ premiumMin: 85, premiumMax: 120, targetPremium: 100, now })).resolves.toMatchObject({ ce: { productId: 11 }, pe: { productId: 21 }, expiry: "180826" });
  });
});
