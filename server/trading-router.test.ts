import { beforeEach, describe, expect, it, vi } from "vitest";
import { queueCloseRequest, recordTradeEvent } from "./db";

vi.mock("./db", async importActual => {
  const actual = await importActual<typeof import("./db")>();
  return { ...actual, queueCloseRequest: vi.fn(), recordTradeEvent: vi.fn() };
});

import { tradingRouter } from "./routers/trading";

const adminUser = { id: 7, openId: "local:owner", username: "owner", name: "Owner", email: null, loginMethod: "local", passwordHash: null, failedSignInCount: 0, lockedUntil: null, passwordChangedAt: null, role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const caller = (user = adminUser) => tradingRouter.createCaller({ user, req: {} as never, res: {} as never });

describe("confirmed account-scoped trade close queue", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("refuses a close request that does not pass the explicit confirmation schema", async () => {
    await expect(caller().trade.requestClose({ pairId: 12, confirmed: false as never, reason: "Owner dashboard close" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(queueCloseRequest).not.toHaveBeenCalled();
  });

  it("queues an explicitly confirmed percentage close and records its audit event", async () => {
    vi.mocked(queueCloseRequest).mockResolvedValue({ id: 99, pairId: 12, requestedBy: 7, closePercent: 50, reason: "Dashboard 50% paired close", status: "pending", error: null, createdAt: new Date(), processedAt: null });
    await expect(caller().trade.requestClose({ pairId: 12, closePercent: 50, confirmed: true, reason: "Dashboard 50% paired close" })).resolves.toMatchObject({ id: 99, status: "pending" });
    expect(queueCloseRequest).toHaveBeenCalledWith(7, 12, 50, "Dashboard 50% paired close");
    expect(recordTradeEvent).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, pairId: 12, eventType: "CLOSE_REQUEST_QUEUED" }));
  });

  it("allows an authenticated local user to queue only its own confirmed close", async () => {
    const nonAdmin = { ...adminUser, id: 8, role: "user" as const };
    vi.mocked(queueCloseRequest).mockResolvedValue({ id: 100, pairId: 12, requestedBy: 8, closePercent: 25, reason: "Dashboard 25% paired close", status: "pending", error: null, createdAt: new Date(), processedAt: null });
    await expect(caller(nonAdmin).trade.requestClose({ pairId: 12, closePercent: 25, confirmed: true, reason: "Dashboard 25% paired close" })).resolves.toMatchObject({ id: 100 });
    expect(queueCloseRequest).toHaveBeenCalledWith(8, 12, 25, "Dashboard 25% paired close");
  });
});
