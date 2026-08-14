import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { assertLiveCloseArmed, describeDeltaConnectivityFailure, getTickers, verifyShortOption } from "./delta";

const originalFetch = global.fetch;
const originalKey = ENV.deltaApiKey;
const originalSecret = ENV.deltaApiSecret;
const originalMode = ENV.deltaMode;
const originalLiveEnabled = ENV.liveTradingEnabled;
const originalLiveAck = ENV.liveTradingAcknowledgement;
const originalLiveLots = ENV.liveLots;
const originalMaxLiveLots = ENV.maxLiveLots;

afterEach(() => {
  global.fetch = originalFetch;
  ENV.deltaApiKey = originalKey;
  ENV.deltaApiSecret = originalSecret;
  ENV.deltaMode = originalMode;
  ENV.liveTradingEnabled = originalLiveEnabled;
  ENV.liveTradingAcknowledgement = originalLiveAck;
  ENV.liveLots = originalLiveLots;
  ENV.maxLiveLots = originalMaxLiveLots;
});

describe("Delta response boundary", () => {
  it("normalizes public ticker quotes without exposing server credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: [{ symbol: "C-BTC-65000-010126", product_id: 42, mark_price: "93.5", quotes: { best_bid: "92", best_ask: "95" } }] }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const quotes = await getTickers(["C-BTC-65000-010126"]);
    expect(quotes.get("C-BTC-65000-010126")).toEqual({ symbol: "C-BTC-65000-010126", productId: 42, bid: 92, mark: 93.5, ask: 95 });
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("api-key");
  });

  it("retries a transient read-only ticker request exactly once", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network changed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ symbol: "BTCUSD", product_id: 1, mark_price: "65000", quotes: {} }] }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const quotes = await getTickers(["BTCUSD"]);
    expect(quotes.get("BTCUSD")).toMatchObject({ mark: 65000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives an actionable but credential-safe message for an IP allowlist rejection", () => {
    const message = describeDeltaConnectivityFailure(new Error("Delta request rejected: forbidden IP address is not whitelisted"));
    expect(message).toContain("source IP is not allowlisted");
    expect(message).not.toContain("api-key");
  });

  it("accepts only a verified open short of the requested option type for manual adoption", async () => {
    ENV.deltaApiKey = "test-key";
    ENV.deltaApiSecret = "test-secret";
    ENV.deltaMode = "demo";
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true, result: { product_id: 42, product_symbol: "C-BTC-65000-010126", size: "-120", entry_price: "100" } }), { status: 200 }))) as typeof fetch;
    await expect(verifyShortOption(42, "C-BTC-")).resolves.toMatchObject({ productId: 42, lots: 120, entryPrice: 100 });
    await expect(verifyShortOption(42, "P-BTC-")).rejects.toThrow("not an open short P BTC option");
  });

  it("falls back to the BTC position list when a demo product-specific lookup returns invalid_date", async () => {
    ENV.deltaApiKey = "test-key";
    ENV.deltaApiSecret = "test-secret";
    ENV.deltaMode = "demo";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: "invalid_date" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ product_id: 191827, product_symbol: "C-BTC-65000-010126", size: "-1", entry_price: "100" }] }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(verifyShortOption(191827, "C-BTC-")).resolves.toMatchObject({ productId: 191827, lots: 1, entryPrice: 100 });
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("underlying_asset_symbol=BTC");
  });

  it("fails closed for live reduce-only actions until all server and owner arming gates are present", () => {
    ENV.deltaMode = "live";
    ENV.liveTradingEnabled = false;
    ENV.liveTradingAcknowledgement = "";
    ENV.liveLots = 0;
    ENV.maxLiveLots = 0;
    expect(() => assertLiveCloseArmed({ liveArmed: false })).toThrow("not armed");
    expect(() => assertLiveCloseArmed({ liveArmed: true })).toThrow("blocked until the server-side live-trading gates");
  });
});
