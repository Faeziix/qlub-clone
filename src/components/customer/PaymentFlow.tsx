"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  CreditCard,
  Users,
  ReceiptText,
  Sparkles,
  PartyPopper,
} from "lucide-react";
import type { PaymentMethod, SplitType } from "@/lib/types";
import { makeT, dirFor } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { evenSplit, tipFromPct } from "@/lib/pricing";
import { formatRialAsToman } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: string;
  modifiers: { optionName: string }[];
}
interface OrderData {
  id: string;
  orderNumber: string;
  subtotal: string;
  serviceCharge: string;
  tax: string;
  total: string;
  amountPaid: string;
  tableLabel: string | null;
  items: OrderItem[];
}

const METHODS: { id: PaymentMethod; label: string; emoji: string }[] = [
  { id: "apple_pay", label: "Apple Pay", emoji: "" },
  { id: "google_pay", label: "Google Pay", emoji: "🅖" },
  { id: "card", label: "Credit / Debit Card", emoji: "💳" },
  { id: "tabby", label: "Tabby — Pay in 4", emoji: "🟢" },
  { id: "benefit", label: "Benefit Pay", emoji: "🔵" },
];

type Step = "pay" | "success" | "review" | "done";

export function PaymentFlow({
  lang,
  theme,
  vendorSlug,
  vendorName,
  country,
  currency,
  tippingEnabled,
  tipPresets,
  order,
}: {
  lang: string;
  theme: string;
  vendorSlug: string;
  vendorName: string;
  country: string;
  currency: string;
  tippingEnabled: boolean;
  tipPresets: number[];
  order: OrderData;
}) {
  const t = makeT(lang);
  const dir = dirFor(lang);
  const router = useRouter();

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add(`theme-${theme}`);
    root.setAttribute("dir", dir);
  }, [theme, dir]);

  const remaining = BigInt(order.total) - BigInt(order.amountPaid);

  const [step, setStep] = React.useState<Step>("pay");
  const [split, setSplit] = React.useState<SplitType>("full");
  const [parts, setParts] = React.useState(2);
  const [partIndex] = React.useState(0);
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);
  const [customAmount, setCustomAmount] = React.useState("");
  const [tipPct, setTipPct] = React.useState<number | "custom" | null>(null);
  const [customTip, setCustomTip] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("apple_pay");
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── compute the base amount this guest pays (before tip) ──
  const baseAmount = React.useMemo(() => {
    if (split === "even") return evenSplit(remaining, parts)[partIndex] ?? 0n;
    if (split === "items") {
      const sum = order.items
        .filter((i) => selectedItems.includes(i.id))
        .reduce((s, i) => s + BigInt(i.lineTotal), 0n);
      const subtotalBig = BigInt(order.subtotal);
      const serviceChargeBig = BigInt(order.serviceCharge);
      const taxBig = BigInt(order.tax);
      const extra = subtotalBig > 0n
        ? (sum * (serviceChargeBig + taxBig)) / subtotalBig
        : 0n;
      return sum + extra;
    }
    if (split === "custom") {
      const parsed = customAmount ? BigInt(customAmount.replace(/,/g, "")) : 0n;
      return parsed;
    }
    return remaining;
  }, [split, parts, partIndex, selectedItems, customAmount, remaining, order]);

  const tip = React.useMemo(() => {
    if (!tippingEnabled || tipPct == null) return 0n;
    if (tipPct === "custom") {
      const parsed = customTip ? BigInt(customTip.replace(/,/g, "")) : 0n;
      return parsed;
    }
    return tipFromPct(baseAmount, tipPct);
  }, [tipPct, customTip, baseAmount, tippingEnabled]);

  const payTotal = baseAmount + tip;

  async function pay() {
    if (baseAmount <= 0n) {
      setError("Enter an amount to pay.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 1200)); // simulate gateway
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          amount: baseAmount,
          tipAmount: tip,
          method,
          splitType: split,
          splitMeta:
            split === "even"
              ? { parts, partIndex }
              : split === "items"
                ? { items: selectedItems }
                : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Payment failed");
      setStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  }

  // ─────────────────────────── SUCCESS ───────────────────────────
  if (step === "success") {
    return (
      <Centered dir={dir}>
        <div className="animate-fade-in text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success">
            <Check size={44} />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold">{t("paymentSuccess")}</h1>
          <p className="mt-1 text-muted">
            {currency} {formatRialAsToman(payTotal)} · {vendorName}
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
              Back to menu
            </Button>
          </div>
        </div>
      </Centered>
    );
  }

  // ─────────────────────────── REVIEW ───────────────────────────
  if (step === "review") {
    return (
      <ReviewScreen
        t={t}
        dir={dir}
        vendorSlug={vendorSlug}
        orderId={order.id}
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
            Your feedback helps {vendorName} improve.
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

  // ─────────────────────────── PAY ───────────────────────────
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

        {/* Bill */}
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
                    {formatRialAsToman(BigInt(i.lineTotal))}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-line pt-3 text-sm">
              <SummaryRow label={t("subtotal")} v={order.subtotal} c={currency} />
              {BigInt(order.serviceCharge) > 0n && (
                <SummaryRow
                  label={t("serviceCharge")}
                  v={order.serviceCharge}
                  c={currency}
                />
              )}
              {BigInt(order.tax) > 0n && (
                <SummaryRow label={t("tax")} v={order.tax} c={currency} />
              )}
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-base font-extrabold">
                <span>{t("total")}</span>
                <span>
                  {currency} {formatRialAsToman(BigInt(order.total))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Split */}
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
              <span className="text-sm font-semibold">Number of people</span>
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
                      "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm",
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
                      {formatRialAsToman(BigInt(i.lineTotal))}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {split === "custom" && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3">
              <span className="font-bold text-muted">{currency}</span>
              <input
                inputMode="decimal"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-lg font-bold outline-none"
              />
            </div>
          )}
        </Section>

        {/* Tip */}
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
                  sub={`${formatRialAsToman(tipFromPct(baseAmount, p))}`}
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
                <span className="font-bold text-muted">{currency}</span>
                <input
                  inputMode="decimal"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-lg font-bold outline-none"
                />
              </div>
            )}
          </Section>
        )}

        {/* Payment method */}
        <Section title={t("paymentMethod")} icon={<CreditCard size={18} />}>
          <div className="space-y-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left",
                  method === m.id ? "border-brand bg-brand-soft" : "border-line"
                )}
              >
                <span className="text-xl">{m.id === "apple_pay" ? "" : m.emoji}</span>
                <span className="flex-1 font-semibold">{m.label}</span>
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

      {/* Pay bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface safe-bottom">
        <div className="mx-auto max-w-app p-4">
          {error && (
            <p className="mb-2 text-center text-sm text-danger">{error}</p>
          )}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted">You pay</span>
            <span className="text-right">
              <span className="text-lg font-extrabold">
                {currency} {formatRialAsToman(payTotal)}
              </span>
              {tip > 0 && (
                <span className="block text-xs text-muted">
                  incl. {formatRialAsToman(tip)} tip
                </span>
              )}
            </span>
          </div>
          <Button fullWidth size="lg" loading={processing} onClick={pay}>
            {processing
              ? "Processing…"
              : `${t("payNow")} · ${currency} ${formatRialAsToman(payTotal)}`}
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
  orderId,
  onDone,
}: {
  t: (k: string) => string;
  dir: string;
  vendorSlug: string;
  orderId: string;
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
          orderId,
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
          placeholder="Tell us more (optional)…"
          className="mt-6 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
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

// ── small presentational helpers ──
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
  c,
}: {
  label: string;
  v: string;
  c: string;
}) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="font-semibold text-ink">
        {c} {formatRialAsToman(BigInt(v))}
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
