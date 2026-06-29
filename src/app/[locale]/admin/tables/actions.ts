"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { checkAdminActionLimit } from "@/lib/admin-rate-limit";
import { cryptoPasscode } from "@/lib/table-token";
import { generateTablePublicId } from "@/lib/table-code";

import { TableStatus } from "@prisma/client";

const STATUSES = ["available", "occupied", "bill_requested"] as const;
type AllowedTableStatus = (typeof STATUSES)[number];

function assertVendorOwnership(
  sessionVendorId: string | null,
  targetVendorId: string
) {
  if (sessionVendorId && sessionVendorId !== targetVendorId) {
    throw new Error("Forbidden: table belongs to another vendor.");
  }
}

async function assertVendorActive(vendorId: string, role: string) {
  if (role === "superadmin") return;
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { active: true },
  });
  if (!vendor?.active) {
    throw new Error("VendorSuspended: this tenant is currently suspended.");
  }
}

async function requireOwnedTable(tableId: string) {
  const session = await requireRole("manager");
  await checkAdminActionLimit(session.id);
  const table = await db.diningTable.findUnique({
    where: { id: tableId },
    select: { id: true, vendorId: true },
  });
  if (!table) throw new Error("Table not found.");
  assertVendorOwnership(session.vendorId, table.vendorId);
  await assertVendorActive(table.vendorId, session.role);
  return { table, session };
}

export async function createTable(
  vendorId: string,
  input: { code: string; label: string; seats: number; area: string }
) {
  const session = await requireRole("manager");
  await checkAdminActionLimit(session.id);
  assertVendorOwnership(session.vendorId, vendorId);
  await assertVendorActive(vendorId, session.role);

  const code = input.code.trim();
  const label = input.label.trim();
  if (!vendorId) throw new Error("Missing vendor.");
  if (!code) throw new Error("Table code is required.");

  const seats = Number.isFinite(input.seats)
    ? Math.max(1, Math.min(40, Math.round(input.seats)))
    : 2;

  let publicId = generateTablePublicId();
  while (await db.diningTable.findUnique({ where: { publicId } })) {
    publicId = generateTablePublicId();
  }

  const created = await db.diningTable.create({
    data: {
      vendorId,
      code,
      label: label || `Table ${code}`,
      area: input.area.trim() || "Main",
      seats,
      passcode: cryptoPasscode(),
      publicId,
      status: "available",
    },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId,
    action: "CREATE_TABLE",
    entity: "DiningTable",
    entityId: created.id,
    after: { code, label: label || `Table ${code}`, seats, publicId },
  });

  revalidatePath("/admin/tables");
}

export async function updateTableStatus(tableId: string, status: string) {
  if (!STATUSES.includes(status as AllowedTableStatus)) {
    throw new Error("Invalid status.");
  }
  const { table, session } = await requireOwnedTable(tableId);
  await db.diningTable.update({
    where: { id: tableId },
    data: { status: status as TableStatus },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: table.vendorId,
    action: "UPDATE_TABLE_STATUS",
    entity: "DiningTable",
    entityId: tableId,
    after: { status },
  });

  revalidatePath("/admin/tables");
}

export async function deleteTable(tableId: string) {
  const { table, session } = await requireOwnedTable(tableId);
  await db.diningTable.delete({ where: { id: tableId } });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: table.vendorId,
    action: "DELETE_TABLE",
    entity: "DiningTable",
    entityId: tableId,
  });

  revalidatePath("/admin/tables");
}
