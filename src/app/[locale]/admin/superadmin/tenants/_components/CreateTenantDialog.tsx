"use client";

import { useTransition, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { createTenant } from "../../actions";

export function CreateTenantDialog() {
  const t = useTranslations("admin.superadmin");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setError(null);

    startTransition(async () => {
      const result = await createTenant({
        slug: String(formData.get("slug") ?? ""),
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? "") || undefined,
        phone: String(formData.get("phone") ?? "") || undefined,
        email: String(formData.get("email") ?? "") || undefined,
      });

      if (result.ok) {
        setOpen(false);
        formRef.current?.reset();
      } else {
        setError(t(`error_${result.messageKey}` as never) ?? result.messageKey);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-colors hover:opacity-90"
      >
        <Plus size={16} />
        {t("createTenant")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-card" dir="rtl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-bold">{t("createTenantTitle")}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
                aria-label={t("close")}
              >
                <X size={18} />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="ct-name">
                  {t("tenantName")}
                </label>
                <input
                  id="ct-name"
                  name="name"
                  required
                  maxLength={200}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="ct-slug">
                  {t("tenantSlug")}
                </label>
                <input
                  id="ct-slug"
                  name="slug"
                  required
                  pattern="[a-z0-9-]+"
                  maxLength={64}
                  dir="ltr"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <p className="text-xs text-muted">{t("slugHint")}</p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="ct-phone">
                  {t("phone")}
                </label>
                <input
                  id="ct-phone"
                  name="phone"
                  type="tel"
                  maxLength={30}
                  dir="ltr"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="ct-email">
                  {t("email")}
                </label>
                <input
                  id="ct-email"
                  name="email"
                  type="email"
                  maxLength={254}
                  dir="ltr"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>

              {error && (
                <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-2"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? t("creating") : t("create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
