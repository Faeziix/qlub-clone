import { getSession } from "./auth";
import { redirect } from "next/navigation";
import type { SessionUser, StaffRole } from "./types";

export const ROLE_HIERARCHY: Record<StaffRole, number> = {
  staff: 1,
  manager: 2,
  owner: 3,
  superadmin: 4,
};

/**
 * Synchronous guard: throws `Forbidden` if the session role falls below `minimum`.
 * Call this inside server actions after you already have the session in hand.
 */
export function assertRole(session: SessionUser, minimum: StaffRole): void {
  if (ROLE_HIERARCHY[session.role] < ROLE_HIERARCHY[minimum]) {
    throw new Error(
      `Forbidden: role '${session.role}' does not meet minimum '${minimum}'.`
    );
  }
}

/**
 * Async guard: resolves the session from the cookie, redirects to login if
 * absent, throws Forbidden if the role is insufficient.
 * Replaces `requireSession` for actions that need a minimum role.
 */
export async function requireRole(minimum: StaffRole): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  assertRole(session, minimum);
  return session;
}
