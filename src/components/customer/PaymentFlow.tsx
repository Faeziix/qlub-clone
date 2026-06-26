"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  CreditCard,
  Loader2,
  Users,
  ReceiptText,
  Sparkles,
  PartyPopper,
} from "lucide-react";
import axios from "axios";
import type { SplitType } from "@/lib/types";
import { makeT, dirFor } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import { formatRialAsToman } from "@/lib/money";

function displayPrice(rialAmount: bigint | number, locale: string): string {
  const rial =
    typeof rialAmount === "bigint" ? rialAmount : BigInt(Math.round(rialAmount));
  return locale === "fa"
    ? formatRialAsTomanPersian(rial)
    : `${formatRialAsToman(rial)} Toman`;
}

function currencyInputLabel(locale: string): string {
  return locale === "fa" ? "تومان" : "Toman";
}
import { evenSplit, tipFromPct } from "@/lib/pricing";
import { bigintToJson, parseTomanInput } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
  modifiers: { optionName: string }[];
}
interface OrderData {
  id: string;
  orderNumber: string;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  total: number;
  amountPaid: number;
  tableLabel: string | null;
  items: OrderItem[];
}

type UiPaymentMethod = "ipg" | "cash";

const PAYMENT_METHOD_IDS: { id: UiPaymentMethod; tKey: string; emoji: string }[] = [
  { id: "ipg", tKey: "methodIpg", emoji: "💳" },
  { id: "cash", tKey: "methodCash", emoji: "💵" },
];

type Step = "pay" | "success" | "review" | "done";

export function PaymentFlow({
  lang,
  vendorSlug,
  vendorName,
  country,
  tippingEnabled,
  tipPresets,
  order,
}: {
  lang: string;
  vendorSlug: string;
  vendorName: string;
  country: string;
  tippingEnabled: boolean;
  tipPresets: number[];
  order: OrderData;
}) {
  const t = makeT(lang);
  const dir = dirFor(lang);
  const router = useRouter();

  const remainingRial = BigInt(order.total) - BigInt(order.amountPaid);

  const [step, setStep] = React.useState<Step>("pay");
  const [split, setSplit] = React.useState<SplitType>("full");
  const [parts, setParts] = React.useState(2);
  const [partIndex] = React.useState(0);
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);
  const [customAmount, setCustomAmount] = React.useState("");
  const [tipPct, setTipPct] = React.useState<number | "custom" | null>(null);
  const [customTip, setCustomTip] = React.useState("");
  const [method, setMethod] = React.useState<UiPaymentMethod>("ipg");
  const [paymentId, setPaymentId] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingGatewayUrl, setPendingGatewayUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pendingGatewayUrl) return;
    window.location.href = pendingGatewayUrl;
  }, [pendingGatewayUrl]);

  let baseAmountRial: bigint;
  if (split === "even") {
    baseAmountRial = evenSplit(remainingRial, parts)[partIndex] ?? 0n;
  } else if (split === "items") {
    const sum = order.items
      .filter((i) => selectedItems.includes(i.id))
      .reduce((s, i) => s + BigInt(i.lineTotal), 0n);
    const subtotalRial = BigInt(order.subtotal);
    const charges = BigInt(order.serviceCharge) + BigInt(order.tax);
    baseAmountRial = subtotalRial === 0n ? sum : sum + (charges * sum) / subtotalRial;
  } else if (split === "custom") {
    baseAmountRial = parseTomanInput(customAmount);
  } else {
    baseAmountRial = remainingRial;
  }

  let tipRial: bigint;
  if (!tippingEnabled || tipPct == null) {
    tipRial = 0n;
  } else if (tipPct === "custom") {
    tipRial = parseTomanInput(customTip);
  } else {
    tipRial = tipFromPct(baseAmountRial, tipPct);
  }

  const payTotalRial = baseAmountRial + tipRial;

  async function pay() {
    if (baseAmountRial <= 0n) {
      setError(t("enterAmount"));
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const { data } = await axios.post<{
        ok: boolean;
        error?: string;
        payment?: { id: string };
        gatewayRedirectUrl?: string;
      }>("/api/payments", {
        orderId: order.id,
        amount: bigintToJson(baseAmountRial),
        tipAmount: bigintToJson(tipRial),
        method,
        splitType: split,
        splitMeta:
          split === "even"
            ? { parts, partIndex }
            : split === "items"
              ? { items: selectedItems }
              : undefined,
      });

      if (!data.ok) throw new Error(data.error ?? t("paymentFailed"));

      if (method === "ipg" && data.gatewayRedirectUrl) {
        setPendingGatewayUrl(data.gatewayRedirectUrl);
        return;
      }

      if (data.payment?.id) setPaymentId(data.payment.id);
      setStep("success");
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.error
          ? (e.response.data.error as string)
          : e instanceof Error
            ? e.message
            : t("paymentFailed");
      setError(msg);
    } finally {
      setProcessing(false);
    }
  }

  if (step === "success") {
    return (
      <Centered dir={dir}>
        <div className="animate-fade-in text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success">
            <Check size={44} />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold">{t("paymentSuccess")}</h1>
          <p className="mt-1 text-muted">
            {displayPrice(payTotalRial, lang)} · {vendorName}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t("receipt")} #{order.orderNumber}
          </p>
          <div className="mt-8 space-y-3">
            <Button fullWidth size="lg" onClick={() => setStep("review")}>
              <Sparkles size={18} /> {t("rateExperience")}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => router.push(`/qr/${country}/${vendorSlug}`)}
            >
              {t("backToMenu")}
            </Button>
          </div>
        </div>
      </Centered>
    );
  }

  if (step === "review") {
    return (
      <ReviewScreen
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
          <Button
            className="mt-8"
            size="lg"
            onClick={() => router.push(`/qr/${country}/${vendorSlug}`)}
          >
            {t("browseMenu")}
          </Button>
        </div>
      </Centered>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-bg pb-40">
      <div className="mx-auto max-w-app">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <button
            onClick={() => router.push(`/qr/${country}/${vendorSlug}`)}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold leading-tight">{t("payBill")}</h1>
            <p className="text-xs text-muted">
              {order.tableLabel ? `${order.tableLabel} · ` : ""}#
              {order.orderNumber}
            </p>
          </div>
        </header>

        <div className="px-4 pt-4">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="space-y-2">
              {order.items.map((i) => (
                <div
                  key={i.id}
                  className="flex items-start justify-between text-sm"
                >
                  <span className="text-ink">
                    {i.quantity}× {i.name}
                    {i.modifiers.length > 0 && (
                      <span className="block text-xs text-muted">
                        {i.modifiers.map((m) => m.optionName).join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold">
                    {displayPrice(i.lineTotal, lang)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-line pt-3 text-sm">
              <SummaryRow label={t("subtotal")} v={order.subtotal} lang={lang} />
              {order.serviceCharge > 0 && (
                <SummaryRow
                  label={t("serviceCharge")}
                  v={order.serviceCharge}
                  lang={lang}
                />
              )}
              {order.tax > 0 && (
                <SummaryRow label={t("tax")} v={order.tax} lang={lang} />
              )}
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-base font-extrabold">
                <span>{t("total")}</span>
                <span>
                  {displayPrice(order.total, lang)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Section title={t("splitBill")} icon={<Users size={18} />}>
          <div className="grid grid-cols-2 gap-2">
            <SplitOption
              active={split === "full"}
              onClick={() => setSplit("full")}
              label={t("payFull")}
            />
            <SplitOption
              active={split === "even"}
              onClick={() => setSplit("even")}
              label={t("splitEven")}
            />
            <SplitOption
              active={split === "items"}
              onClick={() => setSplit("items")}
              label={t("splitItems")}
            />
            <SplitOption
              active={split === "custom"}
              onClick={() => setSplit("custom")}
              label={t("splitCustom")}
            />
          </div>

          {split === "even" && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-sm font-semibold">{t("numberOfPeople")}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setParts(Math.max(2, parts - 1))}
                  className="grid h-8 w-8 place-items-center rounded-full bg-surface shadow-card"
                >
                  −
                </button>
                <span className="w-6 text-center font-bold">{parts}</span>
                <button
                  onClick={() => setParts(Math.min(12, parts + 1))}
                  className="grid h-8 w-8 place-items-center rounded-full bg-surface shadow-card"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {split === "items" && (
            <div className="mt-3 space-y-2">
              {order.items.map((i) => {
                const checked = selectedItems.includes(i.id);
                return (
                  <button
                    key={i.id}
                    onClick={() =>
                      setSelectedItems((prev) =>
                        checked
                          ? prev.filter((x) => x !== i.id)
                          : [...prev, i.id]
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-start text-sm",
                      checked ? "border-brand bg-brand-soft" : "border-line"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "grid h-5 w-5 place-items-center rounded-md border-2",
                          checked
                            ? "border-brand bg-brand text-brand-fg"
                            : "border-line"
                        )}
                      >
                        {checked && <Check size={13} />}
                      </span>
                      {i.quantity}× {i.name}
                    </span>
                    <span className="font-semibold">
                      {displayPrice(i.lineTotal, lang)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {split === "custom" && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3">
              <span className="font-bold text-muted">{currencyInputLabel(lang)}</span>
              <input
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-lg font-bold outline-none"
              />
            </div>
          )}
        </Section>

        {tippingEnabled && (
          <Section title={t("addTip")} icon={<Sparkles size={18} />}>
            <div className="grid grid-cols-4 gap-2">
              <TipChip
                active={tipPct === null}
                onClick={() => setTipPct(null)}
                label={t("noTip")}
              />
              {tipPresets.map((p) => (
                <TipChip
                  key={p}
                  active={tipPct === p}
                  onClick={() => setTipPct(p)}
                  label={`${p}%`}
                  sub={displayPrice(tipFromPct(baseAmountRial, p), lang)}
                />
              ))}
            </div>
            <button
              onClick={() => setTipPct("custom")}
              className={cn(
                "mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold",
                tipPct === "custom" ? "border-brand bg-brand-soft" : "border-line"
              )}
            >
              {t("custom")}
            </button>
            {tipPct === "custom" && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3">
                <span className="font-bold text-muted">{currencyInputLabel(lang)}</span>
                <input
                  inputMode="numeric"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-lg font-bold outline-none"
                />
              </div>
            )}
          </Section>
        )}

        <Section title={t("paymentMethod")} icon={<CreditCard size={18} />}>
          <div className="space-y-2">
            {PAYMENT_METHOD_IDS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start",
                  method === m.id ? "border-brand bg-brand-soft" : "border-line"
                )}
              >
                <span className="text-xl">{m.emoji}</span>
                <span className="flex-1 font-semibold">{t(m.tKey)}</span>
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full border-2",
                    method === m.id
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-line"
                  )}
                >
                  {method === m.id && <Check size={13} />}
                </span>
              </button>
            ))}
          </div>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface safe-bottom">
        <div className="mx-auto max-w-app p-4">
          {error && (
            <p className="mb-2 text-center text-sm text-danger">{error}</p>
          )}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted">{t("youPay")}</span>
            <span className="text-end">
              <span className="text-lg font-extrabold">
                {displayPrice(payTotalRial, lang)}
              </span>
              {tipRial > 0n && (
                <span className="block text-xs text-muted">
                  {t("inclTip").replace("{amount}", displayPrice(tipRial, lang))}
                </span>
              )}
            </span>
          </div>
          <Button fullWidth size="lg" loading={processing} onClick={pay}>
            {processing && method === "ipg" ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                {t("ipgRedirecting")}
              </span>
            ) : processing ? (
              t("processing")
            ) : (
              `${t("payNow")} · ${displayPrice(payTotalRial, lang)}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewScreen({
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
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorSlug,
          paymentId,
          rating: rating || 5,
          foodRating: food || undefined,
          serviceRating: service || undefined,
          ambienceRating: ambience || undefined,
          comment: comment.trim() || undefined,
          guestName: name.trim() || undefined,
        }),
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
          <RatingRow
            label={t("service")}
            value={service}
            onChange={setService}
          />
          <RatingRow
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

function Centered({
  children,
  dir,
}: {
  children: React.ReactNode;
  dir: string;
}) {
  return (
    <div dir={dir} className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="w-full max-w-app">{children}</div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 pt-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        <span className="text-brand">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SplitOption({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
        active ? "border-brand bg-brand-soft text-brand" : "border-line"
      )}
    >
      {label}
    </button>
  );
}

function TipChip({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center rounded-xl border px-2 py-2.5 text-sm font-bold transition-colors",
        active ? "border-brand bg-brand-soft text-brand" : "border-line"
      )}
    >
      {label}
      {sub && <span className="text-[10px] font-medium text-muted">{sub}</span>}
    </button>
  );
}

function SummaryRow({
  label,
  v,
  lang,
}: {
  label: string;
  v: number;
  lang: string;
}) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="font-semibold text-ink">
        {displayPrice(v, lang)}
      </span>
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
