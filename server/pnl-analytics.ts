import type { RealizedPnlEvent } from "./db";

export const IST_TIME_ZONE = "Asia/Kolkata";

function istDayKey(timestamp: Date) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const part = (kind: string) => parts.find(item => item.type === kind)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function buildPnlAnalytics(events: RealizedPnlEvent[]) {
  const dayMap = new Map<string, { netInr: number; feesInr: number; eventCount: number; wins: number; losses: number }>();
  let netInr = 0;
  let feesInr = 0;
  let grossProfitInr = 0;
  let grossLossInr = 0;
  let wins = 0;
  let losses = 0;
  let bestTradeInr: number | null = null;
  let worstTradeInr: number | null = null;

  for (const event of events) {
    const amount = Number(event.netInr);
    const fee = Number(event.feesInr);
    if (!Number.isFinite(amount) || !Number.isFinite(fee)) continue;
    netInr += amount;
    feesInr += fee;
    if (amount >= 0) {
      wins += 1;
      grossProfitInr += amount;
    } else {
      losses += 1;
      grossLossInr += Math.abs(amount);
    }
    bestTradeInr = bestTradeInr === null ? amount : Math.max(bestTradeInr, amount);
    worstTradeInr = worstTradeInr === null ? amount : Math.min(worstTradeInr, amount);
    const date = istDayKey(event.occurredAt);
    const day = dayMap.get(date) ?? { netInr: 0, feesInr: 0, eventCount: 0, wins: 0, losses: 0 };
    day.netInr += amount;
    day.feesInr += fee;
    day.eventCount += 1;
    if (amount >= 0) day.wins += 1;
    else day.losses += 1;
    dayMap.set(date, day);
  }

  let cumulativeInr = 0;
  const daily = Array.from(dayMap.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => {
    cumulativeInr += value.netInr;
    return { date, ...value, cumulativeInr };
  });
  const validEventCount = wins + losses;
  return {
    totals: {
      netInr,
      feesInr,
      grossProfitInr,
      grossLossInr,
      wins,
      losses,
      eventCount: validEventCount,
      winRate: validEventCount ? (wins / validEventCount) * 100 : 0,
      averageInr: validEventCount ? netInr / validEventCount : 0,
      bestTradeInr,
      worstTradeInr,
    },
    daily,
  };
}
