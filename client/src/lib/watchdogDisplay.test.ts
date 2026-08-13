import { describe, expect, it } from "vitest";
import { getWatchdogBadgePresentation } from "./watchdogDisplay";

describe("watchdog dashboard badge", () => {
  it("renders a non-error not configured label instead of offline when no workspace state exists", () => {
    expect(getWatchdogBadgePresentation(undefined)).toMatchObject({ label: "not configured", tone: "neutral" });
  });

  it("renders an idle non-error label for a keyed account without an adopted pair", () => {
    expect(getWatchdogBadgePresentation("idle")).toMatchObject({ label: "idle", tone: "neutral" });
  });
});
