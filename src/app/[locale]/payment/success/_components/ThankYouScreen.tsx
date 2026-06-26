"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { makeT } from "@/lib/i18n";

interface ThankYouScreenProps {
  lang: string;
  dir: "ltr" | "rtl";
  vendorName: string;
  onBackToMenu: () => void;
}

export function ThankYouScreen({
  lang,
  dir,
  vendorName,
  onBackToMenu,
}: ThankYouScreenProps) {
  const t = makeT(lang);

  return (
    <div dir={dir} className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="w-full max-w-app animate-fade-in text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-soft text-brand">
          <Heart size={40} strokeWidth={2} />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-ink">{t("thankYou")}</h1>
        <p className="mt-2 text-base text-muted">
          {t("feedbackHelps").replace("{name}", vendorName)}
        </p>
        <Button className="mt-8" fullWidth size="lg" onClick={onBackToMenu}>
          {t("browseMenu")}
        </Button>
      </div>
    </div>
  );
}
