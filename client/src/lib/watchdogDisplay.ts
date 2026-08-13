export function getWatchdogBadgePresentation(status: string | undefined) {
  const resolved = status ?? "not_configured";
  if (resolved === "healthy") return { label: "healthy", tone: "healthy", dot: "healthy" };
  if (resolved === "emergency") return { label: "emergency", tone: "emergency", dot: "emergency" };
  if (resolved === "idle" || resolved === "not_configured") return { label: resolved.replaceAll("_", " "), tone: "neutral", dot: "neutral" };
  return { label: resolved.replaceAll("_", " "), tone: "warning", dot: "warning" };
}
