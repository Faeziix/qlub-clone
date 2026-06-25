"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/app/[locale]/admin/actions";

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
  message: string;
};

export async function updateVendorSettings(
  vendorId: string,
  data: VendorSettingsInput
): Promise<SettingsActionState> {
  const session = await requireSession();

  // Authorization: non-superadmins may only update their own vendor.
  if (session.vendorId && session.vendorId !== vendorId) {
    return { ok: false, message: "You are not allowed to edit this vendor." };
  }

  const name = data.name.trim();
  if (!name) {
    return { ok: false, message: "Restaurant name is required." };
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
    return { ok: false, message: "Failed to save settings. Please retry." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");

  return { ok: true, message: "Settings saved." };
}
