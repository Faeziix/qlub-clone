"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

const STATUSES = ["available", "occupied", "bill-requested"] as const;
type TableStatus = (typeof STATUSES)[number];

function randomPasscode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function createTable(
  vendorId: string,
  input: { code: string; label: string; seats: number; area: string }
) {
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
  if (!STATUSES.includes(status as TableStatus)) {
    throw new Error("Invalid status.");
  }
  await db.diningTable.update({
    where: { id: tableId },
    data: { status },
  });
  revalidatePath("/admin/tables");
}

export async function deleteTable(tableId: string) {
  await db.diningTable.delete({ where: { id: tableId } });
  revalidatePath("/admin/tables");
}
