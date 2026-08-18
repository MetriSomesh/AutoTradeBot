export type ScheduledEntryTime = { istTradeDate: string; weekday: number; hour: number; minute: number; due: boolean };

export function getScheduledEntryTime(now: Date, windowMinutes = 5): ScheduledEntryTime {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  const weekdayByName: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayByName[values.weekday] ?? -1;
  const hour = Number(values.hour ?? -1);
  const minute = Number(values.minute ?? -1);
  return {
    istTradeDate: `${values.year}-${values.month}-${values.day}`,
    weekday,
    hour,
    minute,
    due: weekday >= 1 && weekday <= 5 && hour === 22 && minute >= 0 && minute < windowMinutes,
  };
}

export function isScheduledEntryTriggerDue(input: { timeIst: string; weekdays: string; now: Date; windowMinutes?: number }) {
  const clock = getScheduledEntryTime(input.now, input.windowMinutes);
  const match = /^(\d{2}):(\d{2})$/.exec(input.timeIst);
  if (!match) return { ...clock, due: false };
  const triggerHour = Number(match[1]);
  const triggerMinute = Number(match[2]);
  if (triggerHour > 23 || triggerMinute > 59) return { ...clock, due: false };
  const windowMinutes = Math.max(1, input.windowMinutes ?? 5);
  const enabledWeekdays = new Set(input.weekdays.split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value >= 0 && value <= 6));
  const currentMinuteOfDay = clock.hour * 60 + clock.minute;
  const triggerMinuteOfDay = triggerHour * 60 + triggerMinute;
  let elapsedMinutes = currentMinuteOfDay - triggerMinuteOfDay;
  let istTradeDate = clock.istTradeDate;
  let weekday = clock.weekday;
  if (elapsedMinutes < 0) {
    const midnightElapsedMinutes = elapsedMinutes + 24 * 60;
    if (midnightElapsedMinutes < windowMinutes) {
      elapsedMinutes = midnightElapsedMinutes;
      const [year, month, day] = clock.istTradeDate.split("-").map(Number);
      const previousIstDate = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
      istTradeDate = previousIstDate;
      weekday = (weekday + 6) % 7;
    }
  }
  return {
    ...clock,
    istTradeDate,
    weekday,
    due: enabledWeekdays.has(weekday) && elapsedMinutes >= 0 && elapsedMinutes < windowMinutes,
  };
}

export function assertDemoScheduledEntryArmed(input: { enabled: boolean; manualOnlyMode: boolean; credentialMode: "paper" | "demo" | "live"; serverEnabled: boolean; serverAcknowledgement: string; expectedAcknowledgement: string }) {
  if (!input.enabled) throw new Error("Scheduled entry is disabled in Risk Settings.");
  if (input.manualOnlyMode) throw new Error("Manual-only entries are enabled in Risk Settings.");
  if (input.credentialMode !== "demo") throw new Error("Scheduled entry is demo-only. A demo Delta credential is required.");
  if (!input.serverEnabled || input.serverAcknowledgement !== input.expectedAcknowledgement) {
    throw new Error("Demo scheduled entry is blocked until both server-side demo entry gates are explicitly armed.");
  }
}
