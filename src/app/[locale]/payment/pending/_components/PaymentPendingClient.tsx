"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/Button";
import { makeT, dirFor } from "@/lib/i18n";
import type { CustomerOrderSnapshot } from "@/lib/types";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 20;

interface PaymentPendingClientProps {
  lang: string;
  orderId: string;
  vendorSlug: string | null;
  country: string | null;
}

export function PaymentPendingClient({
  lang,
  orderId,
  vendorSlug,
  country,
}: PaymentPendingClientProps) {
  const t = makeT(lang);
  const dir = dirFor(lang);
  const router = useRouter();
  const pollCount = React.useRef(0);

  const menuUrl =
    vendorSlug && country
      ? `/${lang === "fa" ? "" : `${lang}/`}qr/${country}/${vendorSlug}`
      : "/";

  const successUrl = `/payment/success?orderId=${orderId}`;
  const failedUrl = `/payment/failed?orderId=${orderId}`;

  React.useEffect(() => {
    if (!orderId) return;

    const timer = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(timer);
        router.push(failedUrl);
        return;
      }

      try {
        const { data } = await axios.get<CustomerOrderSnapshot>(
          `/api/orders/${orderId}`
        );
        const amountPaid = BigInt(data.amountPaid);
        const total = BigInt(data.total);

        if (amountPaid >= total || data.status === "paid") {
          clearInterval(timer);
          router.push(successUrl);
        }
      } catch {
        // network error — keep polling
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [orderId, router, successUrl, failedUrl]);

  return (
    <div dir={dir} className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="w-full max-w-app text-center" dir={dir}>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-soft text-brand">
          <Loader2 size={44} className="animate-spin" />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold">{t("paymentPending")}</h1>
        <p className="mt-2 text-muted">{t("paymentPendingBody")}</p>

        <Button
          className="mt-8"
          variant="ghost"
          onClick={() => router.push(menuUrl)}
        >
          {t("backToMenu")}
        </Button>
      </div>
    </div>
  );
}
