"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import axios from "axios";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { makeT } from "@/lib/i18n";
import { normalizeDigits } from "@/lib/digit-normalizer";
import { dirFor } from "@/lib/i18n";

interface PayBillSheetProps {
  open: boolean;
  onClose: () => void;
  vendorSlug: string;
  country: string;
  lang: string;
}

export function PayBillSheet({
  open,
  onClose,
  vendorSlug,
  country,
  lang,
}: PayBillSheetProps) {
  const t = makeT(lang);
  const dir = dirFor(lang);
  const router = useRouter();
  const [rawInput, setRawInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function handleClose() {
    setRawInput("");
    setErrorMsg(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeDigits(rawInput.trim());
    if (!normalized) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const { data } = await axios.get<{ id: string; status: string }>(
        "/api/orders/lookup",
        { params: { vendor: vendorSlug, order: normalized } }
      );
      router.push(`/qr/${country}/${vendorSlug}/pay?order=${data.id}`);
      handleClose();
    } catch {
      setErrorMsg(t("orderNotFound"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={t("payBill")}
      dir={dir}
      closeLabel={t("back")}
    >
      <div className="px-5 pb-8 pt-2" dir={dir}>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cta-soft text-cta">
            <Receipt size={28} aria-hidden />
          </div>
          <p className="max-w-xs text-sm text-muted">{t("orderNumberHint")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="order-number-input" className="text-sm font-semibold">
              {t("orderNumber")}
            </label>
            <input
              id="order-number-input"
              type="text"
              inputMode="numeric"
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={t("enterOrderNumber")}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-lg font-bold text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              autoComplete="off"
            />
            {errorMsg && (
              <p className="mt-1 text-sm text-danger" role="alert">
                {errorMsg}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="cta"
            size="lg"
            fullWidth
            loading={loading}
            disabled={!rawInput.trim()}
          >
            {t("findMyBill")}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
