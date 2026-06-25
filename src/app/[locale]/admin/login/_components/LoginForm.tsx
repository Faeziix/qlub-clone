"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login } from "../../actions";
import { Button } from "@/components/ui/Button";
import { Utensils } from "lucide-react";

const DEMO_ACCOUNTS = [
  { email: "admin@qlub.io", label: "platform superadmin" },
  { email: "owner@paul.ae", label: "Paul owner" },
  { email: "manager@paul.ae", label: "Paul manager" },
  { email: "owner@olive.ae", label: "Olive Bistro owner" },
];

export function LoginForm({ showDemoAccounts }: { showDemoAccounts: boolean }) {
  const [state, formAction, pending] = useActionState(login, null);
  const t = useTranslations("admin.auth");

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-brand-fg">
            <Utensils size={26} />
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            qlub<span className="text-brand">_</span> Manager
          </h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl bg-surface p-6 shadow-card"
        >
          <div>
            <label className="mb-1 block text-sm font-semibold">{t("email")}</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t("password")}</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
            />
          </div>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <Button type="submit" fullWidth size="lg" loading={pending}>
            {t("signIn")}
          </Button>
        </form>

        {showDemoAccounts && (
          <div className="mt-4 rounded-xl bg-surface-2 p-4 text-xs text-muted">
            <p className="font-semibold text-ink">{t("demoAccounts")}:</p>
            {DEMO_ACCOUNTS.map((account) => (
              <p key={account.email} className="mt-1">
                {account.email} — {account.label}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
