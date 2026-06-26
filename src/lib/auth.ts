import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { SessionUser } from "./types";
import { requireAuthSecret } from "./env";
import { db } from "./db";

const COOKIE = "qlub_admin_session";

/**
 * Short-lived sessions: 1 hour. Sensitive actions additionally re-validate
 * the StaffUser row (active flag, role) against the DB via `revalidateSession`.
 */
const SESSION_TTL_SECONDS = 60 * 60;

function authSigningKey() {
  return new TextEncoder().encode(requireAuthSecret());
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(authSigningKey());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSigningKey());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser["role"],
      vendorId: (payload.vendorId as string) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Re-fetches the StaffUser row from the DB and refreshes the session cookie.
 * Use on sensitive actions (settings changes, menu price edits, etc.) to catch
 * revoked or role-changed accounts without waiting for the JWT to expire.
 *
 * Returns the up-to-date session, or null if the user no longer exists or is
 * inactive (callers should treat null as an auth failure and redirect to login).
 */
export async function revalidateSession(): Promise<SessionUser | null> {
  const current = await getSession();
  if (!current) return null;

  const staffUser = await db.staffUser.findUnique({
    where: { id: current.id },
    select: { id: true, email: true, name: true, role: true, vendorId: true, active: true },
  });

  if (!staffUser || !staffUser.active) {
    await destroySession();
    return null;
  }

  const refreshed: SessionUser = {
    id: staffUser.id,
    email: staffUser.email,
    name: staffUser.name,
    role: staffUser.role as SessionUser["role"],
    vendorId: staffUser.vendorId,
  };

  await createSession(refreshed);
  return refreshed;
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
