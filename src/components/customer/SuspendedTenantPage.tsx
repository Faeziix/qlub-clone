import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";

const RTL_LOCALES = ["fa", "ar", "he", "ur"];

export async function SuspendedTenantPage({ locale }: { locale?: string }) {
  const t = await getTranslations("suspended");
  const dir = locale && RTL_LOCALES.includes(locale) ? "rtl" : "ltr";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6 text-center" dir={dir}>
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-muted">
        <AlertTriangle size={32} />
      </span>

      <div className="max-w-xs space-y-2">
        <h1 className="text-xl font-extrabold">{t("title")}</h1>
        <p className="text-sm text-muted">{t("body")}</p>
      </div>
    </div>
  );
}
