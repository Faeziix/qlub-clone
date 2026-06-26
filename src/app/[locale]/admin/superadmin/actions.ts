"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertRole } from "@/lib/rbac";
import { revalidateSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { checkAdminActionLimit } from "@/lib/admin-rate-limit";
import { redirect } from "next/navigation";

export type SuperadminActionState = {
  ok: boolean;
  messageKey: string;
  data?: Record<string, unknown>;
};

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  eNamadStatus: string;
  createdAt: Date;
  _count: { staff: number; orders: number };
};

export type PlatformStaffRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  vendorId: string | null;
  createdAt: Date;
  vendor: { name: string; slug: string } | null;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  timezone: z.string().default("Asia/Tehran"),
  currency: z.string().default("IRR"),
  locale: z.string().default("fa"),
});

const ProvisionOwnerSchema = z.object({
  vendorId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
});

const StaffRoleSchema = z.enum(["owner", "manager", "staff"]);

const ListTenantsSchema = z.object({
  search: z.string().optional(),
  activeOnly: z.boolean().optional(),
});

const ListStaffSchema = z.object({
  search: z.string().optional(),
  vendorId: z.string().optional(),
  activeOnly: z.boolean().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function requireSuperadmin() {
  await requireRole("superadmin");
  const liveSession = await revalidateSession();
  if (!liveSession) redirect("/admin/login");
  assertRole(liveSession, "superadmin");
  await checkAdminActionLimit(liveSession.id);
  return liveSession;
}

// ── Tenant management ─────────────────────────────────────────────────────────

export async function createTenant(
  input: z.input<typeof CreateTenantSchema>
): Promise<SuperadminActionState> {
  const session = await requireSuperadmin();

  const parsed = CreateTenantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, messageKey: "validationError" };
  }

  const data = parsed.data;

  const existing = await db.vendor.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return { ok: false, messageKey: "slugTaken" };
  }

  const vendor = await db.vendor.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      address: data.address ?? null,
      phone: data.phone ?? null,
      email: data.email || null,
      timezone: data.timezone,
      currency: data.currency,
      locale: data.locale,
      active: true,
    },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: vendor.id,
    action: "CREATE_TENANT",
    entity: "Vendor",
    entityId: vendor.id,
    after: { slug: vendor.slug, name: vendor.name },
  });

  revalidatePath("/admin/superadmin");
  return { ok: true, messageKey: "tenantCreated", data: { vendorId: vendor.id } };
}

export async function suspendTenant(
  vendorId: string
): Promise<SuperadminActionState> {
  const session = await requireSuperadmin();

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return { ok: false, messageKey: "notFound" };

  await db.vendor.update({ where: { id: vendorId }, data: { active: false } });

  await recordAuditEvent({
    actorId: session.id,
    vendorId,
    action: "SUSPEND_TENANT",
    entity: "Vendor",
    entityId: vendorId,
    before: { active: true },
    after: { active: false },
  });

  revalidatePath("/admin/superadmin");
  return { ok: true, messageKey: "tenantSuspended" };
}

export async function reactivateTenant(
  vendorId: string
): Promise<SuperadminActionState> {
  const session = await requireSuperadmin();

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return { ok: false, messageKey: "notFound" };

  await db.vendor.update({ where: { id: vendorId }, data: { active: true } });

  await recordAuditEvent({
    actorId: session.id,
    vendorId,
    action: "REACTIVATE_TENANT",
    entity: "Vendor",
    entityId: vendorId,
    before: { active: false },
    after: { active: true },
  });

  revalidatePath("/admin/superadmin");
  return { ok: true, messageKey: "tenantReactivated" };
}

// ── Owner provisioning ────────────────────────────────────────────────────────

export async function provisionOwner(
  input: z.input<typeof ProvisionOwnerSchema>
): Promise<SuperadminActionState> {
  const session = await requireSuperadmin();

  const parsed = ProvisionOwnerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, messageKey: "validationError" };
  }

  const data = parsed.data;

  const vendor = await db.vendor.findUnique({ where: { id: data.vendorId } });
  if (!vendor) return { ok: false, messageKey: "vendorNotFound" };

  const existing = await db.staffUser.findUnique({
    where: { email: data.email.toLowerCase() },
  });
  if (existing) return { ok: false, messageKey: "emailTaken" };

  const passwordHash = await hashPassword(data.password);

  const owner = await db.staffUser.create({
    data: {
      vendorId: data.vendorId,
      email: data.email.toLowerCase(),
      name: data.name,
      passwordHash,
      role: "owner",
      active: true,
    },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: data.vendorId,
    action: "PROVISION_OWNER",
    entity: "StaffUser",
    entityId: owner.id,
    after: { email: owner.email, role: owner.role, vendorId: data.vendorId },
  });

  revalidatePath("/admin/superadmin");
  return { ok: true, messageKey: "ownerProvisioned", data: { staffId: owner.id } };
}

// ── Tenant listing ────────────────────────────────────────────────────────────

export async function listTenants(
  input: z.input<typeof ListTenantsSchema>
): Promise<TenantRow[]> {
  await requireSuperadmin();

  const parsed = ListTenantsSchema.safeParse(input);
  const { search, activeOnly } = parsed.success ? parsed.data : {};

  const vendors = await db.vendor.findMany({
    where: {
      ...(activeOnly !== undefined ? { active: activeOnly } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      eNamadStatus: true,
      createdAt: true,
      _count: { select: { staff: true, orders: true } },
    },
  });

  return vendors as TenantRow[];
}

// ── Platform-wide staff management ───────────────────────────────────────────

export async function listPlatformStaff(
  input: z.input<typeof ListStaffSchema>
): Promise<PlatformStaffRow[]> {
  await requireSuperadmin();

  const parsed = ListStaffSchema.safeParse(input);
  const { search, vendorId, activeOnly } = parsed.success ? parsed.data : {};

  const staff = await db.staffUser.findMany({
    where: {
      ...(vendorId !== undefined ? { vendorId } : {}),
      ...(activeOnly !== undefined ? { active: activeOnly } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      vendorId: true,
      createdAt: true,
      vendor: { select: { name: true, slug: true } },
    },
  });

  return staff as PlatformStaffRow[];
}

export async function changeStaffRole(
  staffId: string,
  newRole: string
): Promise<SuperadminActionState> {
  const session = await requireSuperadmin();

  const roleResult = StaffRoleSchema.safeParse(newRole);
  if (!roleResult.success) {
    if (newRole === "superadmin") {
      return { ok: false, messageKey: "cannotPromoteToSuperadmin" };
    }
    return { ok: false, messageKey: "invalidRole" };
  }

  const target = await db.staffUser.findUnique({ where: { id: staffId } });
  if (!target) return { ok: false, messageKey: "notFound" };

  if (target.role === "superadmin") {
    return { ok: false, messageKey: "cannotModifySuperadmin" };
  }

  await db.staffUser.update({
    where: { id: staffId },
    data: { role: roleResult.data },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: target.vendorId,
    action: "CHANGE_STAFF_ROLE",
    entity: "StaffUser",
    entityId: staffId,
    before: { role: target.role },
    after: { role: roleResult.data },
  });

  revalidatePath("/admin/superadmin");
  return { ok: true, messageKey: "roleChanged" };
}

export async function deactivateStaff(
  staffId: string
): Promise<SuperadminActionState> {
  const session = await requireSuperadmin();

  const target = await db.staffUser.findUnique({ where: { id: staffId } });
  if (!target) return { ok: false, messageKey: "notFound" };

  if (target.role === "superadmin") {
    return { ok: false, messageKey: "cannotModifySuperadmin" };
  }

  await db.staffUser.update({
    where: { id: staffId },
    data: { active: false },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: target.vendorId,
    action: "DEACTIVATE_STAFF",
    entity: "StaffUser",
    entityId: staffId,
    before: { active: true },
    after: { active: false },
  });

  revalidatePath("/admin/superadmin");
  return { ok: true, messageKey: "staffDeactivated" };
}

export async function reactivateStaff(
  staffId: string
): Promise<SuperadminActionState> {
  const session = await requireSuperadmin();

  const target = await db.staffUser.findUnique({ where: { id: staffId } });
  if (!target) return { ok: false, messageKey: "notFound" };

  await db.staffUser.update({
    where: { id: staffId },
    data: { active: true },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: target.vendorId,
    action: "REACTIVATE_STAFF",
    entity: "StaffUser",
    entityId: staffId,
    before: { active: false },
    after: { active: true },
  });

  revalidatePath("/admin/superadmin");
  return { ok: true, messageKey: "staffReactivated" };
}
