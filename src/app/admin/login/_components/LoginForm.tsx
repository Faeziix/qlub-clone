"use client";

import { useActionState } from "react";
import { login } from "../../actions";
import { Button } from "@/components/ui/Button";
import { Utensils } from "lucide-react";

const DEMO_ACCOUNTS = [
  { email: "owner@paul.ae", label: "Paul UAE owner" },
  { email: "manager@paul.ae", label: "Paul UAE manager" },
  { email: "admin@qlub.io", label: "platform superadmin" },
];

export function LoginForm({ showDemoAccounts }: { showDemoAccounts: boolean }) {
  const [state, formAction, pending] = useActionState(login, null);

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
          <p className="mt-1 text-sm text-muted">
            Sign in to your restaurant dashboard
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl bg-surface p-6 shadow-card"
        >
          <div>
            <label className="mb-1 block text-sm font-semibold">Email</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Password</label>
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
            Sign in
          </Button>
        </form>

        {showDemoAccounts && (
          <div className="mt-4 rounded-xl bg-surface-2 p-4 text-xs text-muted">
            <p className="font-semibold text-ink">Demo accounts:</p>
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
