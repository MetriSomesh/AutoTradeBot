import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { assertLiveCloseArmed, describeDeltaConnectivityFailure, getShortOptionCandidates, getTickers, verifyShortOption } from "./delta";

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
    await expect(verifyShortOption({ productId: 42, optionType: "CE", underlying: "BTC" })).resolves.toMatchObject({ productId: 42, lots: 120, entryPrice: 100, underlying: "BTC" });
    await expect(verifyShortOption({ productId: 42, optionType: "PE", underlying: "BTC" })).rejects.toThrow("not an open short PE BTC option");
  });

  it("falls back to the BTC position list when a demo product-specific lookup returns invalid_date", async () => {
    ENV.deltaApiKey = "test-key";
    ENV.deltaApiSecret = "test-secret";
    ENV.deltaMode = "demo";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: "invalid_date" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ product_id: 191827, product_symbol: "C-BTC-65000-010126", size: "-1", entry_price: "100" }] }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(verifyShortOption({ productId: 191827, optionType: "CE" })).resolves.toMatchObject({ productId: 191827, lots: 1, entryPrice: 100 });
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("underlying_asset_symbol=BTC");
  });

  it("discovers XAUT Gold calls and puts only from the supported XAUT position list", async () => {
    ENV.deltaApiKey = "test-key";
    ENV.deltaApiSecret = "test-secret";
    ENV.deltaMode = "demo";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ product_id: 9, product_symbol: "C-BTC-65000-010126", size: "-1", entry_price: "100" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [
        { product_id: 101, product_symbol: "C-XAUT-4350-180826", size: "-3", entry_price: "82" },
        { product_id: 102, product_symbol: "P-XAUT-4300-180826", size: "-3", entry_price: "61" },
      ] }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(getShortOptionCandidates()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 101, optionType: "CE", underlying: "XAUT", underlyingLabel: "Gold Token" }),
      expect.objectContaining({ productId: 102, optionType: "PE", underlying: "XAUT", underlyingLabel: "Gold Token" }),
    ]));
    expect(String(fetchMock.mock.calls[1][0])).toContain("underlying_asset_symbol=XAUT");
  });

  it("keeps BTC candidate discovery available when the separate XAUT list is temporarily unavailable", async () => {
    ENV.deltaApiKey = "test-key";
    ENV.deltaApiSecret = "test-secret";
    ENV.deltaMode = "demo";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ product_id: 9, product_symbol: "C-BTC-65000-010126", size: "-1", entry_price: "100" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: "unsupported_underlying" } }), { status: 400 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(getShortOptionCandidates()).resolves.toEqual([expect.objectContaining({ productId: 9, underlying: "BTC" })]);
  });

  it("falls back through the XAUT position list for a Gold product-specific invalid_date response", async () => {
    ENV.deltaApiKey = "test-key";
    ENV.deltaApiSecret = "test-secret";
    ENV.deltaMode = "demo";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: "invalid_date" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ product_id: 146957, product_symbol: "C-XAUT-4420-170826", size: "-1", entry_price: "82" }] }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(verifyShortOption({ productId: 146957, optionType: "CE", underlying: "XAUT" })).resolves.toMatchObject({ underlying: "XAUT", lots: 1 });
    expect(String(fetchMock.mock.calls[1][0])).toContain("underlying_asset_symbol=XAUT");
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
