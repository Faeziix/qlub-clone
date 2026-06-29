"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  createSession,
  destroySession,
  verifyPassword,
  getSession,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { getLimiter } from "@/lib/limiters";

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  const loginLimiter = await getLimiter("login");
  const limiterKey = `login:${email}`;
  const limitCheck = await loginLimiter.check(limiterKey);
  if (!limitCheck.allowed) {
    return { errorKey: "tooManyAttempts" as const };
  }

  const user = await db.staffUser.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { errorKey: "invalidCredentials" as const };
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { errorKey: "invalidCredentials" as const };

  await loginLimiter.reset(limiterKey);

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "superadmin" | "owner" | "manager" | "staff",
    vendorId: user.vendorId,
  });

  await recordAuditEvent({
    actorId: user.id,
    vendorId: user.vendorId,
    action: "LOGIN",
    entity: "StaffUser",
    entityId: user.id,
  });

  redirect(user.role === "superadmin" ? "/admin/superadmin" : "/admin");
}

export async function logout() {
  const session = await getSession();
  if (session) {
    await recordAuditEvent({
      actorId: session.id,
      vendorId: session.vendorId,
      action: "LOGOUT",
      entity: "StaffUser",
      entityId: session.id,
    });
  }
  await destroySession();
  redirect("/admin/login");
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}
