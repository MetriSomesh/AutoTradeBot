import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScheduledEntryTrigger, deleteScheduledEntryTrigger, queueCloseRequest, recordTradeEvent, updateScheduledEntryTrigger } from "./db";

vi.mock("./db", async importActual => {
  const actual = await importActual<typeof import("./db")>();
  return { ...actual, createScheduledEntryTrigger: vi.fn(), deleteScheduledEntryTrigger: vi.fn(), queueCloseRequest: vi.fn(), recordTradeEvent: vi.fn(), updateScheduledEntryTrigger: vi.fn() };
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

describe("scheduled-entry trigger controls", () => {
  const draft = { label: "Morning", timeIst: "09:30", weekdays: [1, 2, 3, 4, 5], enabled: false, lots: 120, premiumMin: 85, premiumMax: 120 };
  beforeEach(() => { vi.clearAllMocks(); });

  it("creates a disabled trigger and rejects direct creation as enabled", async () => {
    vi.mocked(createScheduledEntryTrigger).mockResolvedValue({ id: 21, ownerId: 7, ...draft, weekdays: "1,2,3,4,5", premiumMin: "85.000000", premiumMax: "120.000000" } as never);
    await expect(caller().scheduledEntries.create(draft)).resolves.toMatchObject({ id: 21, timeIst: "09:30" });
    expect(createScheduledEntryTrigger).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, enabled: false, timeIst: "09:30" }));
    await expect(caller().scheduledEntries.create({ ...draft, enabled: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires confirmation for enablement, permits time edits, and removes only confirmed triggers", async () => {
    await expect(caller().scheduledEntries.update({ id: 21, enabled: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    vi.mocked(updateScheduledEntryTrigger).mockResolvedValue({ id: 21, ownerId: 7, ...draft, enabled: true } as never);
    await expect(caller().scheduledEntries.update({ id: 21, enabled: true, confirmed: true })).resolves.toMatchObject({ enabled: true });
    await expect(caller().scheduledEntries.update({ id: 21, enabled: false })).resolves.toMatchObject({ id: 21 });
    expect(updateScheduledEntryTrigger).toHaveBeenCalledWith(7, 21, expect.objectContaining({ enabled: false }));
    await expect(caller().scheduledEntries.update({ id: 21, timeIst: "22:00" })).resolves.toMatchObject({ id: 21 });
    expect(updateScheduledEntryTrigger).toHaveBeenCalledWith(7, 21, expect.objectContaining({ timeIst: "22:00" }));
    await expect(caller().scheduledEntries.remove({ id: 21, confirmed: false as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller().scheduledEntries.remove({ id: 21, confirmed: true });
    expect(deleteScheduledEntryTrigger).toHaveBeenCalledWith(7, 21);
  });

  it("surfaces the database unique-time guard when a duplicate owner trigger time is requested", async () => {
    vi.mocked(createScheduledEntryTrigger).mockRejectedValue(new Error("Duplicate entry '7-09:30' for key 'scheduled_entry_trigger_owner_time_unique'"));
    await expect(caller().scheduledEntries.create(draft)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
