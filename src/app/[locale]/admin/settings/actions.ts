"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, assertRole } from "@/lib/rbac";
import { revalidateSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { redirect } from "next/navigation";
import { checkAdminActionLimit } from "@/lib/admin-rate-limit";

export type VendorSettingsInput = {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  theme: string;
  logoUrl: string;
  coverUrl: string;
  serviceChargePct: number;
  taxPct: number;
  taxInclusive: boolean;
  tippingEnabled: boolean;
  tipPresets: number[];
};

const THEMES = ["darkgold", "classic", "emerald", "rose", "midnight"] as const;

export type SettingsActionState = {
  ok: boolean;
  messageKey: string;
};

export async function updateVendorSettings(
  vendorId: string,
  data: VendorSettingsInput
): Promise<SettingsActionState> {
  /**
   * Two-step auth: first pass the JWT-based RBAC guard (fast, no DB round-trip),
   * then re-validate against the DB to catch revoked/role-changed accounts.
   * This is a sensitive action (financial config change), so DB re-validation is required.
   */
  await requireRole("owner");

  const liveSession = await revalidateSession();
  if (!liveSession) redirect("/admin/login");

  assertRole(liveSession, "owner");
  await checkAdminActionLimit(liveSession.id);

  if (liveSession.vendorId && liveSession.vendorId !== vendorId) {
    throw new Error("Forbidden: cannot modify another vendor's settings.");
  }

  if (liveSession.role !== "superadmin") {
    const vendorCheck = await db.vendor.findUnique({
      where: { id: vendorId },
      select: { active: true },
    });
    if (!vendorCheck?.active) {
      throw new Error("VendorSuspended: this tenant is currently suspended.");
    }
  }

  const name = data.name.trim();
  if (!name) {
    return { ok: false, messageKey: "nameRequired" };
  }

  const theme = THEMES.includes(data.theme as (typeof THEMES)[number])
    ? data.theme
    : "darkgold";

  const tipPresets = (data.tipPresets ?? [])
    .map((n) => Math.max(0, Math.round(Number.isFinite(n) ? n : 0)))
    .slice(0, 3);
  while (tipPresets.length < 3) tipPresets.push(0);

  const clampPct = (n: number) =>
    Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

  const before = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { name: true, theme: true, serviceChargePct: true, taxPct: true },
  });

  try {
    await db.vendor.update({
      where: { id: vendorId },
      data: {
        name,
        description: data.description.trim() || null,
        address: data.address.trim() || null,
        phone: data.phone.trim() || null,
        email: data.email.trim() || null,
        theme,
        logoUrl: data.logoUrl.trim() || null,
        coverUrl: data.coverUrl.trim() || null,
        serviceChargePct: clampPct(data.serviceChargePct),
        taxPct: clampPct(data.taxPct),
        taxInclusive: Boolean(data.taxInclusive),
        tippingEnabled: Boolean(data.tippingEnabled),
        tipPresets,
      },
    });
  } catch {
    return { ok: false, messageKey: "saveFailed" };
  }

  await recordAuditEvent({
    actorId: liveSession.id,
    vendorId,
    action: "UPDATE_VENDOR_SETTINGS",
    entity: "Vendor",
    entityId: vendorId,
    before: before ?? undefined,
    after: { name, theme, serviceChargePct: clampPct(data.serviceChargePct) },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/");

  return { ok: true, messageKey: "saved" };
}
