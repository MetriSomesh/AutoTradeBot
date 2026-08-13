import { describe, expect, it } from "vitest";
import { LOCAL_SESSION_COOKIE } from "./local-auth";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type CookieCall = { name: string; options: Record<string, unknown> };
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const user: AuthenticatedUser = {
    id: 1, openId: "local:sample", username: "sample", email: "sample@example.com", name: "Sample User", loginMethod: "local", passwordHash: null, failedSignInCount: 0, lockedUntil: null, passwordChangedAt: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  };
  return {
    ctx: {
      user,
      req: { protocol: "https", secure: true, headers: {} } as TrpcContext["req"],
      res: { clearCookie: (name: string, options: Record<string, unknown>) => clearedCookies.push({ name, options }) } as TrpcContext["res"],
    },
    clearedCookies,
  };
}

describe("local auth logout", () => {
  it("clears the HTTP-only local session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    await expect(appRouter.createCaller(ctx).auth.logout()).resolves.toEqual({ success: true });
    expect(clearedCookies).toEqual([expect.objectContaining({ name: LOCAL_SESSION_COOKIE, options: expect.objectContaining({ maxAge: -1, secure: true, sameSite: "lax", httpOnly: true, path: "/" }) })]);
  });
});
