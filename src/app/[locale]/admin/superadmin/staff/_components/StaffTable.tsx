"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserCircle2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/admin/ui";
import { changeStaffRole, deactivateStaff, reactivateStaff } from "../../actions";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  vendorId: string | null;
  createdAt: Date;
  vendor: { name: string; slug: string } | null;
};

const ASSIGNABLE_ROLES = ["owner", "manager", "staff"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function StaffTable({ staff }: { staff: StaffMember[] }) {
  const t = useTranslations("admin.superadmin");

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs uppercase text-muted">
              <th className="pb-3 font-semibold">{t("staffMember")}</th>
              <th className="pb-3 font-semibold">{t("restaurant")}</th>
              <th className="pb-3 font-semibold">{t("role")}</th>
              <th className="pb-3 font-semibold">{t("status")}</th>
              <th className="pb-3 text-end font-semibold">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <StaffRow key={s.id} member={s} />
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted">
                  {t("noStaff")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StaffRow({ member }: { member: StaffMember }) {
  const t = useTranslations("admin.superadmin");
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as AssignableRole;
    startTransition(async () => {
      await changeStaffRole(member.id, newRole);
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      if (member.active) {
        await deactivateStaff(member.id);
      } else {
        await reactivateStaff(member.id);
      }
    });
  }

  return (
    <tr className="border-t border-line">
      <td className="py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2">
            <UserCircle2 size={16} className="text-muted" />
          </span>
          <div>
            <p className="font-semibold">{member.name}</p>
            <p className="text-xs text-muted" dir="ltr">{member.email}</p>
          </div>
        </div>
      </td>

      <td className="py-3 text-muted">
        {member.vendor ? (
          <div>
            <p className="text-sm">{member.vendor.name}</p>
            <p className="text-xs text-muted">{member.vendor.slug}</p>
          </div>
        ) : (
          <span className="text-xs">—</span>
        )}
      </td>

      <td className="py-3">
        <select
          value={member.role}
          onChange={handleRoleChange}
          disabled={isPending}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold disabled:opacity-50"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role_${r}`)}
            </option>
          ))}
        </select>
      </td>

      <td className="py-3">
        {member.active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            <CheckCircle2 size={12} />
            {t("active")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
            <XCircle size={12} />
            {t("inactive")}
          </span>
        )}
      </td>

      <td className="py-3 text-end">
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={isPending}
          className={
            member.active
              ? "rounded-lg border border-danger/30 px-3 py-1 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
              : "rounded-lg border border-success/30 px-3 py-1 text-xs font-semibold text-success hover:bg-success/10 disabled:opacity-50"
          }
        >
          {member.active ? t("deactivate") : t("reactivate")}
        </button>
      </td>
    </tr>
  );
}
