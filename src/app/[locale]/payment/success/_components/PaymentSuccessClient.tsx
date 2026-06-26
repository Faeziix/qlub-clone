"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, PartyPopper, ReceiptText, Sparkles } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";
import { makeT, dirFor } from "@/lib/i18n";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import { formatRialAsToman } from "@/lib/money";

function displayAmount(rialAmount: number, lang: string): string {
  const rial = BigInt(Math.round(rialAmount));
  return lang === "fa" ? formatRialAsTomanPersian(rial) : `${formatRialAsToman(rial)} Toman`;
}

type ReviewStep = "success" | "review" | "done";

interface PaymentSuccessClientProps {
  lang: string;
  orderNumber: string;
  total: number;
  vendorName: string;
  vendorSlug: string;
  country: string;
  paymentId: string | null;
  tippingEnabled: boolean;
}

export function PaymentSuccessClient({
  lang,
  orderNumber,
  total,
  vendorName,
  vendorSlug,
  country,
  paymentId,
}: PaymentSuccessClientProps) {
  const t = makeT(lang);
  const dir = dirFor(lang);
  const router = useRouter();
  const [step, setStep] = React.useState<ReviewStep>("success");

  const menuUrl = `/${lang === "fa" ? "" : `${lang}/`}qr/${country}/${vendorSlug}`;

  if (step === "review") {
    return (
      <ReviewForm
        t={t}
        dir={dir}
        vendorSlug={vendorSlug}
        paymentId={paymentId}
        onDone={() => setStep("done")}
      />
    );
  }

  if (step === "done") {
    return (
      <Centered dir={dir}>
        <div className="animate-fade-in text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-soft text-brand">
            <PartyPopper size={44} />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold">{t("thankYou")}</h1>
          <p className="mt-1 text-muted">
            {t("feedbackHelps").replace("{name}", vendorName)}
          </p>
          <Button className="mt-8" size="lg" onClick={() => router.push(menuUrl)}>
            {t("browseMenu")}
          </Button>
        </div>
      </Centered>
    );
  }

  return (
    <Centered dir={dir}>
      <div className="animate-fade-in text-center" dir={dir}>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success">
          <Check size={44} />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold">{t("paymentSuccess")}</h1>
        <p className="mt-1 text-muted">{t("paymentSuccessBody")}</p>
        <p className="mt-3 text-lg font-extrabold tabular-nums" dir="rtl">
          {displayAmount(total, lang)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t("receipt")} #{orderNumber} · {vendorName}
        </p>

        <div className="mt-8 space-y-3">
          {paymentId && (
            <Button fullWidth size="lg" onClick={() => setStep("review")}>
              <Sparkles size={18} /> {t("rateExperience")}
            </Button>
          )}
          <Button fullWidth variant="ghost" onClick={() => router.push(menuUrl)}>
            {t("backToMenu")}
          </Button>
        </div>
      </div>
    </Centered>
  );
}

function ReviewForm({
  t,
  dir,
  vendorSlug,
  paymentId,
  onDone,
}: {
  t: (k: string) => string;
  dir: string;
  vendorSlug: string;
  paymentId: string | null;
  onDone: () => void;
}) {
  const [rating, setRating] = React.useState(0);
  const [food, setFood] = React.useState(0);
  const [service, setService] = React.useState(0);
  const [ambience, setAmbience] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await axios.post("/api/reviews", {
        vendorSlug,
        paymentId,
        rating: rating || 5,
        foodRating: food || undefined,
        serviceRating: service || undefined,
        ambienceRating: ambience || undefined,
        comment: comment.trim() || undefined,
        guestName: name.trim() || undefined,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={dir} className="min-h-screen bg-bg">
      <div className="mx-auto max-w-app px-5 py-8">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
            <ReceiptText size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{t("rateExperience")}</h1>
        </div>

        <div className="flex flex-col items-center gap-2">
          <StarRating value={rating} onChange={setRating} size={40} />
        </div>

        <div className="mt-8 space-y-4">
          <RatingRow label={t("food")} value={food} onChange={setFood} />
          <RatingRow label={t("service")} value={service} onChange={setService} />
          <RatingRow label={t("ambience")} value={ambience} onChange={setAmbience} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder={t("tellUsMore")}
          className="mt-6 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("yourName")}
          className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
        />

        <Button
          fullWidth
          size="lg"
          className="mt-6"
          loading={busy}
          disabled={rating === 0}
          onClick={submit}
        >
          {t("submitReview")}
        </Button>
      </div>
    </div>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
      <span className="font-semibold">{label}</span>
      <StarRating value={value} onChange={onChange} size={22} />
    </div>
  );
}

function Centered({ children, dir }: { children: React.ReactNode; dir: string }) {
  return (
    <div dir={dir} className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="w-full max-w-app">{children}</div>
    </div>
  );
}

