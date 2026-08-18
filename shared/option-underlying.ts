export const SUPPORTED_OPTION_UNDERLYINGS = ["BTC", "XAUT"] as const;

export type SupportedOptionUnderlying = (typeof SUPPORTED_OPTION_UNDERLYINGS)[number];
export type OptionType = "CE" | "PE";

const UNDERLYING_DETAILS: Record<SupportedOptionUnderlying, { label: string; monitorLabel: string; spotSymbol: string; contractValue: number }> = {
  BTC: { label: "Bitcoin", monitorLabel: "BTC", spotSymbol: "BTCUSD", contractValue: 0.001 },
  XAUT: { label: "Gold Token", monitorLabel: "GOLD / XAUT", spotSymbol: "XAUTUSD", contractValue: 0.001 },
};

export function isSupportedOptionUnderlying(value: string): value is SupportedOptionUnderlying {
  return SUPPORTED_OPTION_UNDERLYINGS.includes(value as SupportedOptionUnderlying);
}

export function getUnderlyingDetails(underlying: SupportedOptionUnderlying) {
  return UNDERLYING_DETAILS[underlying];
}

export function parseSupportedOptionSymbol(symbol: string) {
  const match = /^(C|P)-(BTC|XAUT)-/.exec(symbol.toUpperCase());
  if (!match) return null;
  return {
    optionType: match[1] === "C" ? ("CE" as const) : ("PE" as const),
    underlying: match[2] as SupportedOptionUnderlying,
  };
}

export function underlyingFromOptionSymbol(symbol: string): SupportedOptionUnderlying | null {
  return parseSupportedOptionSymbol(symbol)?.underlying ?? null;
}
