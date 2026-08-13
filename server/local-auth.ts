import { parse } from "cookie";
import type { Request } from "express";
import { getLocalSessionUser } from "./db";
import { hashOpaqueToken } from "./security";

export const LOCAL_SESSION_COOKIE = "tmt_local_session";

export async function getLocalSessionUserFromRequest(req: Request) {
  const token = parse(req.headers.cookie ?? "")[LOCAL_SESSION_COOKIE];
  if (!token) return null;
  try {
    return (await getLocalSessionUser(hashOpaqueToken(token))) ?? null;
  } catch {
    return null;
  }
}

export function localCookieOptions(req: Request, maxAge?: number) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const secure = req.secure || protocol === "https" || process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}
