"use client";

import * as React from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";
import { makeT } from "@/lib/i18n";

interface ReviewFormProps {
  lang: string;
  dir: "ltr" | "rtl";
  vendorSlug: string;
  vendorName: string;
  paymentId: string;
  onDone: () => void;
  onBack: () => void;
}

export function ReviewForm({
  lang,
  dir,
  vendorSlug,
  vendorName,
  paymentId,
  onDone,
  onBack,
}: ReviewFormProps) {
  const t = makeT(lang);
  const [overall, setOverall] = React.useState(0);
  const [food, setFood] = React.useState(0);
  const [service, setService] = React.useState(0);
  const [ambience, setAmbience] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [guestName, setGuestName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;

  async function handleSubmit() {
    if (overall === 0) return;
    setBusy(true);
    try {
      await axios.post("/api/reviews", {
        vendorSlug,
        paymentId,
        rating: overall,
        foodRating: food || undefined,
        serviceRating: service || undefined,
        ambienceRating: ambience || undefined,
        comment: comment.trim() || undefined,
        guestName: guestName.trim() || undefined,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={dir} className="min-h-screen bg-bg">
      <div className="mx-auto max-w-app px-4 pt-5 pb-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink transition-colors"
          aria-label={t("back")}
        >
          <BackIcon size={16} />
          {t("back")}
        </button>

        <div className="animate-fade-in">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-extrabold text-ink">{t("rateExperience")}</h1>
            <p className="mt-1 text-sm text-muted">{vendorName}</p>
          </div>

          <OverallRatingSection
            label={t("overallRating")}
            value={overall}
            onChange={setOverall}
          />

          <div className="mt-6 rounded-2xl border border-line bg-surface shadow-card overflow-hidden">
            <SubRatingRow
              label={t("food")}
              value={food}
              onChange={setFood}
            />
            <div className="border-t border-line" />
            <SubRatingRow
              label={t("service")}
              value={service}
              onChange={setService}
            />
            <div className="border-t border-line" />
            <SubRatingRow
              label={t("ambience")}
              value={ambience}
              onChange={setAmbience}
            />
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={t("tellUsMore")}
            className="mt-4 w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted outline-none focus:border-brand transition-colors"
          />
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={t("yourName")}
            className="mt-3 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted outline-none focus:border-brand transition-colors"
          />

          <Button
            fullWidth
            size="lg"
            className="mt-6"
            loading={busy}
            disabled={overall === 0}
            onClick={handleSubmit}
          >
            {t("submitReview")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverallRatingSection({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-6 shadow-card">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <StarRating value={value} onChange={onChange} size={44} />
    </div>
  );
}

function SubRatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <StarRating value={value} onChange={onChange} size={22} />
    </div>
  );
}
