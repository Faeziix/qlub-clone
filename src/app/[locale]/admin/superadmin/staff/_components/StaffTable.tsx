"use client";

import { useState, useTransition, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  UserCircle2,
  CheckCircle2,
  XCircle,
  Search,
  Building2,
} from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.vendor?.name.toLowerCase().includes(q);
      const matchesRole = roleFilter === "all" || s.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staff, search, roleFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchStaff")}
            className="w-full rounded-xl border border-line bg-surface py-2 pe-3 ps-9 text-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand sm:max-w-xs"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand"
          aria-label={t("filterByRole")}
        >
          <option value="all">{t("allRoles")}</option>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role_${r}`)}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase text-muted">
                  {t("staffMember")}
                </th>
                <th className="hidden px-5 py-3 text-start text-xs font-semibold uppercase text-muted sm:table-cell">
                  {t("restaurant")}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase text-muted">
                  {t("role")}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase text-muted">
                  {t("status")}
                </th>
                <th className="px-5 py-3 text-end text-xs font-semibold uppercase text-muted">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <StaffRow key={s.id} member={s} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-muted"
                  >
                    {search || roleFilter !== "all" ? t("noResults") : t("noStaff")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
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
    <tr
      className={`border-t border-line transition-colors hover:bg-surface-2/50 ${isPending ? "opacity-60" : ""}`}
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
            <UserCircle2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{member.name}</p>
            <p
              className="truncate text-xs text-muted"
              dir="ltr"
            >
              {member.email}
            </p>
          </div>
        </div>
      </td>

      <td className="hidden px-5 py-4 sm:table-cell">
        {member.vendor ? (
          <div className="flex items-center gap-2">
            <Building2 size={13} className="shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="truncate text-sm">{member.vendor.name}</p>
              <p className="truncate text-xs text-muted" dir="ltr">
                {member.vendor.slug}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>

      <td className="px-5 py-4">
        <select
          value={member.role}
          onChange={handleRoleChange}
          disabled={isPending}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold outline-none focus:border-brand disabled:opacity-50"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role_${r}`)}
            </option>
          ))}
        </select>
      </td>

      <td className="px-5 py-4">
        {member.active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            <CheckCircle2 size={11} />
            {t("active")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
            <XCircle size={11} />
            {t("inactive")}
          </span>
        )}
      </td>

      <td className="px-5 py-4 text-end">
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={isPending}
          className={
            member.active
              ? "rounded-lg border border-danger/30 px-3 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              : "rounded-lg border border-success/30 px-3 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10 disabled:opacity-50"
          }
        >
          {member.active ? t("deactivate") : t("reactivate")}
        </button>
      </td>
    </tr>
  );
}
