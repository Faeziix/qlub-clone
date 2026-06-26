"use client";

import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { provisionOwner } from "../../actions";

type Props = {
  vendorId: string;
  vendorName: string;
  onClose: () => void;
};

export function ProvisionOwnerDialog({ vendorId, vendorName, onClose }: Props) {
  const t = useTranslations("admin.superadmin");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setError(null);

    startTransition(async () => {
      const result = await provisionOwner({
        vendorId,
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        password: String(formData.get("password") ?? ""),
      });

      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.messageKey);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-card" dir="rtl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-bold">{t("provisionOwnerTitle")}</h2>
            <p className="text-xs text-muted">{vendorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm font-semibold text-success">{t("ownerProvisionedSuccess")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg"
            >
              {t("close")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="po-name">
                {t("ownerName")}
              </label>
              <input
                id="po-name"
                name="name"
                required
                maxLength={200}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="po-email">
                {t("ownerEmail")}
              </label>
              <input
                id="po-email"
                name="email"
                type="email"
                required
                maxLength={254}
                dir="ltr"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="po-password">
                {t("temporaryPassword")}
              </label>
              <input
                id="po-password"
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                dir="ltr"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                {t(`error_${error}` as never) ?? error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
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
        )}
      </div>
    </div>
  );
}
