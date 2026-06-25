"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/app/admin/actions";

import { TableStatus } from "@prisma/client";

const STATUSES = ["available", "occupied", "bill_requested"] as const;
type AllowedTableStatus = (typeof STATUSES)[number];

function randomPasscode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Guards a table mutation by vendorId. Superadmins (vendorId null) may touch
 * any vendor; scoped admins may only touch their own.
 *
 * Separated from the DB lookup so it can be used for both createTable (where
 * the vendorId is a parameter) and update/delete (where it is resolved from
 * the table record).
 */
function assertVendorOwnership(
  sessionVendorId: string | null,
  targetVendorId: string
) {
  if (sessionVendorId && sessionVendorId !== targetVendorId) {
    throw new Error("Forbidden: table belongs to another vendor.");
  }
}

/**
 * Validates session, then fetches the table and verifies the caller owns its
 * vendor. Returns the table record.
 *
 * Session is checked before any DB read so unauthenticated callers are
 * redirected immediately without leaking table-existence information.
 */
async function requireOwnedTable(tableId: string) {
  const session = await requireSession();
  const table = await db.diningTable.findUnique({
    where: { id: tableId },
    select: { id: true, vendorId: true },
  });
  if (!table) throw new Error("Table not found.");
  assertVendorOwnership(session.vendorId, table.vendorId);
  return table;
}

export async function createTable(
  vendorId: string,
  input: { code: string; label: string; seats: number; area: string }
) {
  const session = await requireSession();
  assertVendorOwnership(session.vendorId, vendorId);

  const code = input.code.trim();
  const label = input.label.trim();
  if (!vendorId) throw new Error("Missing vendor.");
  if (!code) throw new Error("Table code is required.");

  const seats = Number.isFinite(input.seats)
    ? Math.max(1, Math.min(40, Math.round(input.seats)))
    : 2;

  await db.diningTable.create({
    data: {
      vendorId,
      code,
      label: label || `Table ${code}`,
      area: input.area.trim() || "Main",
      seats,
      passcode: randomPasscode(),
      status: "available",
    },
  });

  revalidatePath("/admin/tables");
}

export async function updateTableStatus(tableId: string, status: string) {
  if (!STATUSES.includes(status as AllowedTableStatus)) {
    throw new Error("Invalid status.");
  }
  await requireOwnedTable(tableId);
  await db.diningTable.update({
    where: { id: tableId },
    data: { status: status as TableStatus },
  });
  revalidatePath("/admin/tables");
}

export async function deleteTable(tableId: string) {
  await requireOwnedTable(tableId);
  await db.diningTable.delete({ where: { id: tableId } });
  revalidatePath("/admin/tables");
}
