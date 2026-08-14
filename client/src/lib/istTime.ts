export const IST_TIME_ZONE = "Asia/Kolkata";

function asDate(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatIstDateTime(value: Date | string | number) {
  const date = asDate(value);
  if (!date) return "—";
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date)} IST`;
}

export function formatIstTime(value: Date | string | number) {
  const date = asDate(value);
  if (!date) return "—";
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date)} IST`;
}
