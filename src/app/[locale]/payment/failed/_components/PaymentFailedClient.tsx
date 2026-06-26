"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { makeT, dirFor } from "@/lib/i18n";

interface PaymentFailedClientProps {
  lang: string;
  orderNumber: string | null;
  vendorSlug: string | null;
  country: string | null;
  orderId: string | null;
  reason: string | null;
}

export function PaymentFailedClient({
  lang,
  orderNumber,
  vendorSlug,
  country,
  orderId,
  reason,
}: PaymentFailedClientProps) {
  const t = makeT(lang);
  const dir = dirFor(lang);
  const router = useRouter();

  const retryUrl =
    orderId && vendorSlug && country
      ? `/${lang === "fa" ? "" : `${lang}/`}qr/${country}/${vendorSlug}/pay?order=${orderId}`
      : null;

  const menuUrl =
    vendorSlug && country
      ? `/${lang === "fa" ? "" : `${lang}/`}qr/${country}/${vendorSlug}`
      : "/";

  return (
    <div dir={dir} className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="w-full max-w-app text-center" dir={dir}>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-danger/10 text-danger">
          <XCircle size={44} />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold">{t("paymentFailed")}</h1>
        <p className="mt-2 text-muted">{t("paymentFailedBody")}</p>
        {orderNumber && (
          <p className="mt-1 text-sm text-muted">
            {t("receipt")} #{orderNumber}
          </p>
        )}
        {reason && (
          <p className="mt-2 rounded-xl bg-danger/5 px-4 py-2 text-sm text-danger">
            {reason}
          </p>
        )}

        <div className="mt-8 space-y-3">
          {retryUrl && (
            <Button fullWidth size="lg" variant="cta" onClick={() => router.push(retryUrl)}>
              {t("tryAgain")}
            </Button>
          )}
          <Button fullWidth variant="ghost" onClick={() => router.push(menuUrl)}>
            {t("backToMenu")}
          </Button>
        </div>
      </div>
    </div>
  );
}
