import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "../_core/env";
import { createLocalSession, createLocalUser, getLocalUserByUsername, registerFailedLocalSignIn, resetLocalSignInFailures, revokeLocalSession } from "../db";
import { LOCAL_SESSION_COOKIE, localCookieOptions } from "../local-auth";
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from "../security";
import { publicProcedure, router } from "../_core/trpc";

const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{2,31}$/, "Use 3–32 lowercase letters, numbers, hyphens, or underscores; start with a letter.");
const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Password must be at most 128 characters.");
const sessionMs = () => ENV.localSessionDays * 24 * 60 * 60 * 1000;
const publicUser = <T extends { passwordHash: unknown; failedSignInCount: unknown; lockedUntil: unknown }>(user: T) => {
  const { passwordHash: _passwordHash, failedSignInCount: _failedSignInCount, lockedUntil: _lockedUntil, ...safe } = user;
  return safe;
};

async function establishSession(ctx: { req: Parameters<typeof localCookieOptions>[0]; res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void } }, userId: number) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + sessionMs());
  await createLocalSession(userId, hashOpaqueToken(token), expiresAt);
  ctx.res.cookie(LOCAL_SESSION_COOKIE, token, localCookieOptions(ctx.req, sessionMs()));
}

export const localAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),
  registrationStatus: publicProcedure.query(() => ({ registrationAllowed: ENV.localAuthAllowRegistration })),
  signUp: publicProcedure
    .input(z.object({ username: usernameSchema, name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(320), password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ENV.localAuthAllowRegistration) throw new TRPCError({ code: "FORBIDDEN", message: "Local account registration is disabled by this server." });
      if (await getLocalUserByUsername(input.username)) throw new TRPCError({ code: "CONFLICT", message: "That username is already in use." });
      const user = await createLocalUser({ username: input.username, name: input.name, email: input.email, passwordHash: await hashPassword(input.password) });
      await establishSession(ctx, user.id);
      return { user: publicUser(user) };
    }),
  signIn: publicProcedure
    .input(z.object({ username: usernameSchema, password: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const user = await getLocalUserByUsername(input.username);
      if (!user?.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "This account is temporarily locked. Try again in 15 minutes." });
      if (!(await verifyPassword(input.password, user.passwordHash))) {
        await registerFailedLocalSignIn(user.id);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
      }
      await resetLocalSignInFailures(user.id);
      await establishSession(ctx, user.id);
      return { user: publicUser(user) };
    }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const raw = ctx.req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${LOCAL_SESSION_COOKIE}=`))?.slice(LOCAL_SESSION_COOKIE.length + 1);
    if (raw) await revokeLocalSession(hashOpaqueToken(raw));
    ctx.res.clearCookie(LOCAL_SESSION_COOKIE, localCookieOptions(ctx.req, -1));
    return { success: true } as const;
  }),
});
