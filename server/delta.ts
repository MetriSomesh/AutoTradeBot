import { createHmac, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import {
  getUnderlyingDetails,
  parseSupportedOptionSymbol,
  SUPPORTED_OPTION_UNDERLYINGS,
  type OptionType,
  type SupportedOptionUnderlying,
} from "../shared/option-underlying";

export type DeltaMode = "paper" | "demo" | "live";
export type DeltaCredentialContext = { apiKey: string; apiSecret: string; baseUrl: string; mode: DeltaMode };

export class DeltaApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message);
    this.name = "DeltaApiError";
  }
}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

function isTransientReadFailure(error: unknown) {
  if (!(error instanceof DeltaApiError)) return false;
  return error.status === undefined || error.status === 429 || error.status >= 500;
}

/** Retries only idempotent read operations; it is never used for orders or closes. */
async function retryRead<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (firstError) {
    if (!isTransientReadFailure(firstError)) throw firstError;
    await delay(300);
    return operation();
  }
}

/** Produces a credential-safe remediation message for the persisted worker status. */
export function describeDeltaConnectivityFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (/(ip|address).{0,40}(allow|white|restrict)|(?:allow|white).{0,40}(ip|address)/.test(normalized)) {
    return "Delta rejected the request because the source IP is not allowlisted. Add this MacBook's current public IPv4 address to the Delta API key allowlist, wait for Delta to apply it, then restart the watchdog.";
  }
  if (error instanceof DeltaApiError && error.status === 401) {
    return "Delta rejected the authenticated request. Confirm the selected demo/live key is active, has read permission, and its IP allowlist includes this MacBook's current public IPv4 address.";
  }
  if (error instanceof DeltaApiError && error.status === 429) {
    return "Delta rate-limited a read request. The watchdog will keep polling; wait briefly and check the next status update.";
  }
  if (error instanceof DeltaApiError && error.status !== undefined && error.status >= 500) {
    return "Delta returned a temporary server error. The watchdog will continue polling and resume monitoring after a valid response.";
  }
  if (error instanceof DeltaApiError && error.status === undefined) {
    return "The watchdog could not reach Delta. Check the MacBook internet connection, DNS, and Delta availability; the worker will keep retrying read-only requests.";
  }
  return `Delta monitoring request failed: ${message}`;
}

export type DeltaQuote = {
  symbol: string;
  productId: number | null;
  bid: number;
  mark: number;
  ask: number;
};

export type DeltaPosition = {
  productId: number;
  symbol: string;
  size: number;
  entryPrice: number;
  realizedPnl: number;
  raw: Record<string, unknown>;
};

export type DeltaOrder = Record<string, unknown> & {
  id?: string | number;
  size?: number | string;
  unfilled_size?: number | string;
  average_fill_price?: number | string;
  state?: string;
};

type DeltaEnvelope<T> = { success?: boolean; result?: T; error?: { code?: string; context?: string } | string };

function configuredMode(credentials?: DeltaCredentialContext): DeltaMode {
  if (credentials) return credentials.mode;
  const mode = ENV.deltaMode.toLowerCase();
  if (mode === "demo" || mode === "live") return mode;
  return "paper";
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultCredentials(): DeltaCredentialContext {
  return { apiKey: ENV.deltaApiKey, apiSecret: ENV.deltaApiSecret, baseUrl: ENV.deltaBaseUrl, mode: configuredMode() };
}

function ensureCredentials(credentials: DeltaCredentialContext) {
  if (!credentials.apiKey || !credentials.apiSecret) {
    throw new DeltaApiError("Delta credentials are not configured on the server for this execution mode.");
  }
}

function queryString(params?: Record<string, string | number | undefined>) {
  if (!params) return "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

async function request<T>(
  path: string,
  options: { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string | number | undefined>; body?: Record<string, unknown>; signed?: boolean; credentials?: DeltaCredentialContext } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const query = queryString(options.query);
  const body = options.body ? JSON.stringify(options.body) : "";
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "TMT-Trade-Dashboard/1.0" };
  if (body) headers["Content-Type"] = "application/json";

  if (options.signed) {
    const credentials = options.credentials ?? defaultCredentials();
    ensureCredentials(credentials);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signingPayload = `${method}${timestamp}${path}${query}${body}`;
    headers["api-key"] = credentials.apiKey;
    headers.timestamp = timestamp;
    headers.signature = createHmac("sha256", credentials.apiSecret).update(signingPayload).digest("hex");
  }

  let response: Response;
  try {
    response = await fetch(`${options.credentials?.baseUrl ?? ENV.deltaBaseUrl}${path}${query}`, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new DeltaApiError(`Delta ${method} request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const responseText = await response.text();
  let parsed: DeltaEnvelope<T>;
  try {
    parsed = JSON.parse(responseText) as DeltaEnvelope<T>;
  } catch {
    throw new DeltaApiError(`Delta returned a non-JSON response (${response.status}).`, response.status);
  }
  if (!response.ok || parsed.success === false) {
    const error = parsed.error;
    const code = typeof error === "object" ? error?.code : undefined;
    const context = typeof error === "object" ? error?.context : error;
    throw new DeltaApiError(`Delta request rejected: ${code ?? response.status} ${context ?? ""}`.trim(), response.status, code);
  }
  if (parsed.result === undefined) throw new DeltaApiError("Delta response did not contain a result payload.", response.status);
  return parsed.result;
}

export function getDeltaRuntime(credentials?: DeltaCredentialContext) {
  const mode = configuredMode(credentials);
  return {
    mode,
    baseUrl: credentials?.baseUrl ?? ENV.deltaBaseUrl,
    credentialsConfigured: Boolean(credentials?.apiKey ?? ENV.deltaApiKey) && Boolean(credentials?.apiSecret ?? ENV.deltaApiSecret),
    liveTradingEnabled: ENV.liveTradingEnabled,
    nativeBracketsEnabled: ENV.nativeBracketsEnabled,
  };
}

export async function getTickers(symbols: string[], credentials?: DeltaCredentialContext) {
  const requested = Array.from(new Set(symbols.filter(Boolean)));
  if (!requested.length) return new Map<string, DeltaQuote>();
  const result = await retryRead(() => request<Array<Record<string, unknown>>>("/v2/tickers", {
    query: { contracts: requested.join(",") },
    credentials,
  }));
  const quotes = new Map<string, DeltaQuote>();
  for (const ticker of result) {
    const symbol = String(ticker.symbol ?? "");
    if (!symbol) continue;
    const rawQuotes = (ticker.quotes ?? {}) as Record<string, unknown>;
    quotes.set(symbol, {
      symbol,
      productId: ticker.product_id === undefined || ticker.product_id === null ? null : numeric(ticker.product_id),
      bid: numeric(rawQuotes.best_bid),
      mark: numeric(ticker.mark_price),
      ask: numeric(rawQuotes.best_ask),
    });
  }
  return quotes;
}

export async function getProducts(credentials?: DeltaCredentialContext) {
  const result = await request<Array<Record<string, unknown>>>("/v2/products", { credentials });
  return result;
}

export async function resolveProductIds(symbols: string[], credentials?: DeltaCredentialContext) {
  const needed = new Set(symbols);
  const products = await getProducts(credentials);
  const resolved = new Map<string, { productId: number; symbol: string }>();
  for (const product of products) {
    const symbol = String(product.symbol ?? "");
    const state = String(product.state ?? "live").toLowerCase();
    if (!needed.has(symbol) || state !== "live") continue;
    const productId = numeric(product.id ?? product.product_id);
    if (productId > 0) resolved.set(symbol, { productId, symbol });
  }
  const unresolved = symbols.filter(symbol => !resolved.has(symbol));
  if (unresolved.length) throw new DeltaApiError(`Unable to resolve active product ID(s): ${unresolved.join(", ")}`);
  return resolved;
}

function normalizePosition(raw: Record<string, unknown>): DeltaPosition | null {
  const productId = numeric(raw.product_id);
  const symbol = String(raw.product_symbol ?? "");
  if (!productId || !symbol) return null;
  return {
    productId,
    symbol,
    size: numeric(raw.size),
    entryPrice: numeric(raw.entry_price),
    realizedPnl: numeric(raw.realized_pnl),
    raw,
  };
}

export async function getPositionsForUnderlying(underlyingAssetSymbol = "BTC", credentials?: DeltaCredentialContext) {
  const result = await retryRead(() => request<Array<Record<string, unknown>>>("/v2/positions", {
    query: { underlying_asset_symbol: underlyingAssetSymbol.toUpperCase() },
    signed: true,
    credentials,
  }));
  return result.map(normalizePosition).filter((position): position is DeltaPosition => position !== null);
}

export async function getPosition(productId: number, credentials?: DeltaCredentialContext, underlying?: SupportedOptionUnderlying) {
  let directFailure: unknown;
  try {
    const result = await retryRead(() => request<Record<string, unknown> | Array<Record<string, unknown>>>("/v2/positions", {
      query: { product_id: productId },
      signed: true,
      credentials,
    }));
    const raw = Array.isArray(result) ? result[0] : result;
    const position = raw ? normalizePosition(raw) : null;
    if (position) return position;
    directFailure = new DeltaApiError(`Delta position lookup for product ${productId} returned invalid data.`);
  } catch (error) {
    directFailure = error;
  }

  // The India demo endpoint can reject product-specific option lookups with an
  // `invalid_date` response. The underlying-scoped position list contains the
  // same authoritative open position and is supported by both demo and live.
  try {
    const fallbackUnderlyings = underlying ? [underlying] : SUPPORTED_OPTION_UNDERLYINGS;
    for (const candidateUnderlying of fallbackUnderlyings) {
      const fallback = (await getPositionsForUnderlying(candidateUnderlying, credentials)).find(position => position.productId === productId);
      if (fallback) return fallback;
    }
  } catch (fallbackFailure) {
    if (!directFailure) directFailure = fallbackFailure;
  }

  const detail = directFailure instanceof Error ? directFailure.message : "unknown lookup failure";
  throw new DeltaApiError(`Delta position lookup for product ${productId} could not be verified: ${detail}`);
}

export async function getShortOptionCandidates(credentials?: DeltaCredentialContext) {
  if (configuredMode(credentials) === "paper") throw new DeltaApiError("Manual Delta positions are unavailable while the account is in paper mode.");
  const responses = await Promise.allSettled(SUPPORTED_OPTION_UNDERLYINGS.map(underlying => getPositionsForUnderlying(underlying, credentials)));
  const positionLists = responses
    .filter((response): response is PromiseFulfilledResult<DeltaPosition[]> => response.status === "fulfilled")
    .map(response => response.value);
  if (!positionLists.length) {
    const failure = responses.find((response): response is PromiseRejectedResult => response.status === "rejected");
    throw failure?.reason ?? new DeltaApiError("Delta did not return any supported option position lists.");
  }
  return positionLists.flat()
    .map(position => ({ position, option: parseSupportedOptionSymbol(position.symbol) }))
    .filter(({ position, option }) => position.size < 0 && option !== null)
    .map(({ position, option }) => {
      const parsed = option!;
      return {
        productId: position.productId,
        symbol: position.symbol,
        size: Math.abs(position.size),
        signedSize: position.size,
        entryPrice: position.entryPrice,
        realizedPnl: position.realizedPnl,
        optionType: parsed.optionType,
        underlying: parsed.underlying,
        underlyingLabel: getUnderlyingDetails(parsed.underlying).label,
      };
    });
}

export type ScheduledBtcOptionCandidate = { productId: number; symbol: string; optionType: OptionType; bid: number; mark: number; expiry: string };

export function istDateStamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function nextIstOptionExpiryStamp(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const next = new Date(Date.UTC(Number(lookup.year), Number(lookup.month) - 1, Number(lookup.day) + 1));
  return `${String(next.getUTCDate()).padStart(2, "0")}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCFullYear()).slice(-2)}`;
}

export async function selectScheduledBtcStrangle(input: { premiumMin: number; premiumMax: number; targetPremium?: number; now?: Date; credentials?: DeltaCredentialContext }) {
  const now = input.now ?? new Date();
  const expiry = nextIstOptionExpiryStamp(now);
  const products = await getProducts(input.credentials);
  const eligible = products
    .map(product => ({ productId: numeric(product.id ?? product.product_id), symbol: String(product.symbol ?? ""), state: String(product.state ?? "live").toLowerCase() }))
    .map(product => ({ ...product, parsed: /^([CP])-BTC-\d+-(\d{6})$/.exec(product.symbol) }))
    .filter((product): product is { productId: number; symbol: string; state: string; parsed: RegExpExecArray } => product.productId > 0 && product.state === "live" && product.parsed !== null && product.parsed[2] === expiry);
  if (!eligible.length) throw new DeltaApiError(`No live BTC CE/PE products were found for next-day IST expiry ${expiry}.`);
  const quotes = await getTickers(eligible.map(product => product.symbol), input.credentials);
  const candidates = eligible
    .map(product => {
      const quote = quotes.get(product.symbol);
      return { productId: product.productId, symbol: product.symbol, optionType: product.parsed[1] === "C" ? ("CE" as const) : ("PE" as const), bid: quote?.bid ?? 0, mark: quote?.mark ?? 0, expiry };
    })
    .filter(candidate => candidate.bid >= input.premiumMin && candidate.bid <= input.premiumMax && candidate.mark > 0);
  const target = input.targetPremium ?? (input.premiumMin + input.premiumMax) / 2;
  const closest = (optionType: OptionType) => candidates
    .filter(candidate => candidate.optionType === optionType)
    .sort((a, b) => Math.abs(a.bid - target) - Math.abs(b.bid - target) || a.symbol.localeCompare(b.symbol))[0];
  const ce = closest("CE");
  const pe = closest("PE");
  if (!ce || !pe) throw new DeltaApiError(`No liquid next-day BTC ${!ce ? "CE" : "PE"} candidate is inside the configured $${input.premiumMin}–$${input.premiumMax} sell-premium band.`);
  return { ce, pe, expiry, targetPremium: target };
}

export async function verifyShortOption(input: { productId: number; optionType: OptionType; underlying?: SupportedOptionUnderlying }, credentials?: DeltaCredentialContext) {
  const position = await getPosition(input.productId, credentials, input.underlying);
  const parsed = parseSupportedOptionSymbol(position.symbol);
  const expectedLabel = `${input.optionType} ${input.underlying ?? "supported"}`;
  if (position.size >= 0 || !parsed || parsed.optionType !== input.optionType || (input.underlying && parsed.underlying !== input.underlying)) {
    throw new DeltaApiError(`Product ${input.productId} is not an open short ${expectedLabel} option.`);
  }
  let entryPrice = position.entryPrice;
  if (entryPrice <= 0) {
    const quote = (await getTickers([position.symbol], credentials)).get(position.symbol);
    entryPrice = quote?.mark ?? 0;
  }
  if (entryPrice <= 0) throw new DeltaApiError(`${position.symbol} has no usable entry or mark price.`);
  return {
    productId: position.productId,
    symbol: position.symbol,
    lots: Math.abs(position.size),
    entryPrice,
    underlying: parsed.underlying,
    contractValue: getUnderlyingDetails(parsed.underlying).contractValue,
  };
}

/** @deprecated Use getShortOptionCandidates for BTC and Gold/XAUT manual adoption. */
export const getShortBtcOptionCandidates = getShortOptionCandidates;

export async function placeOrder(input: {
  productId: number;
  symbol: string;
  side: "buy" | "sell";
  size: number;
  orderType: "limit_order" | "market_order";
  limitPrice?: number;
  timeInForce?: "ioc" | "gtc";
  reduceOnly?: boolean;
  clientOrderId?: string;
  credentials?: DeltaCredentialContext;
}) {
  if (input.size <= 0 || !Number.isInteger(input.size)) throw new DeltaApiError("Order size must be a positive whole number.");
  if (input.orderType === "limit_order" && (!input.limitPrice || input.limitPrice <= 0)) {
    throw new DeltaApiError("A positive limit price is required for a limit order.");
  }
  if (configuredMode(input.credentials) === "paper") throw new DeltaApiError("Paper mode never submits Delta orders.");
  const result = await request<DeltaOrder>("/v2/orders", {
    method: "POST",
    signed: true,
    credentials: input.credentials,
    body: {
      product_id: input.productId,
      product_symbol: input.symbol,
      size: input.size,
      side: input.side,
      order_type: input.orderType,
      time_in_force: input.timeInForce ?? "ioc",
      reduce_only: Boolean(input.reduceOnly),
      post_only: false,
      ...(input.limitPrice ? { limit_price: String(input.limitPrice) } : {}),
      client_order_id: (input.clientOrderId ?? `tmt${randomUUID().replaceAll("-", "").slice(0, 28)}`).slice(0, 32),
    },
  });
  return result;
}

export async function placeNativeBracket(input: {
  productId: number;
  symbol: string;
  stopLossPrice: number;
  takeProfitPrice: number;
  triggerMethod?: "mark_price" | "last_traded_price" | "spot_price";
  credentials?: DeltaCredentialContext;
}) {
  if (configuredMode(input.credentials) === "paper") throw new DeltaApiError("Paper mode never submits native Delta brackets.");
  if (!ENV.nativeBracketsEnabled) throw new DeltaApiError("Native Delta brackets are disabled by server configuration.");
  return request<Record<string, unknown>>("/v2/orders/bracket", {
    method: "POST",
    signed: true,
    credentials: input.credentials,
    body: {
      product_id: input.productId,
      product_symbol: input.symbol,
      stop_loss_order: { order_type: "market_order", stop_price: String(input.stopLossPrice) },
      take_profit_order: { order_type: "market_order", stop_price: String(input.takeProfitPrice) },
      bracket_stop_trigger_method: input.triggerMethod ?? "mark_price",
    },
  });
}

export function filledSize(order: DeltaOrder) {
  return Math.max(0, numeric(order.size) - numeric(order.unfilled_size));
}

export async function closeShortPosition(input: { productId: number; symbol: string; clientOrderId?: string; size?: number; credentials?: DeltaCredentialContext }) {
  const underlying = parseSupportedOptionSymbol(input.symbol)?.underlying;
  const position = await getPosition(input.productId, input.credentials, underlying);
  if (position.size >= 0) return { skipped: true, reason: "position is already flat or no longer short", position } as const;
  const positionSize = Math.abs(Math.trunc(position.size));
  const size = input.size === undefined ? positionSize : Math.min(positionSize, Math.trunc(input.size));
  if (size <= 0) return { skipped: true, reason: "requested partial-close quantity is zero", position } as const;
  const order = await placeOrder({
    productId: input.productId,
    symbol: input.symbol,
    side: "buy",
    size,
    orderType: "market_order",
    timeInForce: "ioc",
    reduceOnly: true,
    clientOrderId: input.clientOrderId,
    credentials: input.credentials,
  });
  if (filledSize(order) !== size) {
    throw new DeltaApiError(`Reduce-only close for ${input.symbol} filled ${filledSize(order)}/${size}.`);
  }
  return { skipped: false, order, position } as const;
}

export function assertLiveCloseArmed(risk: { liveArmed: boolean }, credentials?: DeltaCredentialContext) {
  const mode = configuredMode(credentials);
  if (mode === "paper") throw new DeltaApiError("Paper mode is unable to close a live Delta position.");
  if (mode !== "live") return;
  if (!risk.liveArmed) throw new DeltaApiError("Live close actions are not armed in Risk Settings.");
  if (!ENV.liveTradingEnabled || ENV.liveTradingAcknowledgement !== ENV.liveTradingAcknowledgementPhrase) {
    throw new DeltaApiError("Live close actions are blocked until the server-side live-trading gates are explicitly armed.");
  }
  if (ENV.liveLots <= 0 || ENV.maxLiveLots <= 0 || ENV.liveLots > ENV.maxLiveLots) {
    throw new DeltaApiError("Live lot safety limits are not configured correctly on the server.");
  }
}
