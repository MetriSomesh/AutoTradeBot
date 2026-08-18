import { describe, expect, it } from "vitest";
import { getUnderlyingDetails, parseSupportedOptionSymbol } from "../shared/option-underlying";

describe("supported Delta option underlyings", () => {
  it("recognizes BTC and Gold Token XAUT option symbol formats without accepting unrelated symbols", () => {
    expect(parseSupportedOptionSymbol("C-BTC-65000-010126")).toEqual({ optionType: "CE", underlying: "BTC" });
    expect(parseSupportedOptionSymbol("P-XAUT-4300-180826")).toEqual({ optionType: "PE", underlying: "XAUT" });
    expect(parseSupportedOptionSymbol("C-ETH-4000-010126")).toBeNull();
  });

  it("uses the explicit XAUT Gold Token spot reference and contract value", () => {
    expect(getUnderlyingDetails("XAUT")).toEqual(expect.objectContaining({ spotSymbol: "XAUTUSD", contractValue: 0.001, label: "Gold Token" }));
  });
});
