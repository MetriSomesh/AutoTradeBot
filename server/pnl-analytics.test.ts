import { describe, expect, it } from "vitest";
import { buildPnlAnalytics } from "./pnl-analytics";

describe("realized P&L analytics", () => {
  it("aggregates recorded full and partial close events into IST daily bars and summary metrics", () => {
    const analytics = buildPnlAnalytics([
      { id: 1, source: "full_close", occurredAt: new Date("2026-08-10T19:00:00.000Z"), netInr: "500.00", feesInr: "20.00" },
      { id: 2, source: "partial_close", occurredAt: new Date("2026-08-10T20:30:00.000Z"), netInr: "-100.00", feesInr: "10.00" },
      { id: 3, source: "partial_close", occurredAt: new Date("2026-08-11T19:00:00.000Z"), netInr: "200.00", feesInr: "8.00" },
    ]);
    expect(analytics.totals).toMatchObject({ netInr: 600, feesInr: 38, wins: 2, losses: 1, eventCount: 3, bestTradeInr: 500, worstTradeInr: -100 });
    expect(analytics.daily).toHaveLength(2);
    expect(analytics.daily[0]).toMatchObject({ netInr: 400, cumulativeInr: 400 });
    expect(analytics.daily[1]).toMatchObject({ netInr: 200, cumulativeInr: 600 });
  });
});
