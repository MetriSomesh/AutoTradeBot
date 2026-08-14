import { describe, expect, it } from "vitest";
import { formatIstDateTime, formatIstTime } from "./istTime";

describe("IST display formatting", () => {
  it("renders a UTC timestamp using Asia/Kolkata rather than the browser timezone", () => {
    const instant = new Date("2026-08-14T08:37:21.000Z");
    expect(formatIstTime(instant)).toBe("14:07:21 IST");
    expect(formatIstDateTime(instant)).toContain("14:07:21 IST");
  });
});
