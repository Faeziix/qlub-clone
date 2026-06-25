"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Store,
  Palette,
  Receipt,
  HandCoins,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  updateVendorSettings,
  type VendorSettingsInput,
} from "@/app/admin/settings/actions";

type FormState = {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  theme: string;
  logoUrl: string;
  coverUrl: string;
  serviceChargePct: number;
  taxPct: number;
  taxInclusive: boolean;
  tippingEnabled: boolean;
  tipPresets: number[];
};

type ThemeOption = {
  id: string;
  label: string;
  swatch: string; // gradient classes for the preview chip
};

const THEME_OPTIONS: ThemeOption[] = [
  { id: "darkgold", label: "Dark Gold", swatch: "from-amber-400 to-yellow-700" },
  { id: "classic", label: "Classic", swatch: "from-slate-200 to-slate-500" },
  { id: "emerald", label: "Emerald", swatch: "from-emerald-300 to-emerald-700" },
  { id: "rose", label: "Rose", swatch: "from-rose-300 to-rose-600" },
  { id: "midnight", label: "Midnight", swatch: "from-indigo-400 to-slate-900" },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft placeholder:text-muted";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        {description && (
          <p className="text-xs text-muted">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand" : "bg-line"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-extrabold text-ink">{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function SettingsForm({
  vendorId,
  initial,
  currency,
  slug,
  supportedLangs,
}: {
  vendorId: string;
  initial: FormState;
  currency: string;
  slug: string;
  supportedLangs: string[];
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function setTip(index: number, value: number) {
    setForm((f) => {
      const next = [...f.tipPresets];
      next[index] = value;
      return { ...f, tipPresets: next };
    });
    setSaved(false);
    setError(null);
  }

  function onSave() {
    setError(null);
    setSaved(false);
    const payload: VendorSettingsInput = {
      name: form.name,
      description: form.description,
      address: form.address,
      phone: form.phone,
      email: form.email,
      theme: form.theme,
      logoUrl: form.logoUrl,
      coverUrl: form.coverUrl,
      serviceChargePct: form.serviceChargePct,
      taxPct: form.taxPct,
      taxInclusive: form.taxInclusive,
      tippingEnabled: form.tippingEnabled,
      tipPresets: form.tipPresets,
    };
    startTransition(async () => {
      const res = await updateVendorSettings(vendorId, payload);
      if (res.ok) {
        setSaved(true);
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-6 pb-24"
    >
      {/* Profile */}
      <Card>
        <SectionHeading
          icon={<Store className="h-5 w-5" />}
          title="Restaurant profile"
          subtitle="Public details shown to guests and on receipts."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => patch("name", e.target.value)}
              placeholder="e.g. The Gold Spoon"
              required
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(e) => patch("email", e.target.value)}
              placeholder="hello@restaurant.com"
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              value={form.phone}
              onChange={(e) => patch("phone", e.target.value)}
              placeholder="+971 4 000 0000"
            />
          </Field>
          <Field label="Address">
            <input
              className={inputCls}
              value={form.address}
              onChange={(e) => patch("address", e.target.value)}
              placeholder="Street, city, country"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <textarea
                className={cn(inputCls, "min-h-24 resize-y")}
                value={form.description}
                onChange={(e) => patch("description", e.target.value)}
                placeholder="A short description of your restaurant."
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Branding */}
      <Card>
        <SectionHeading
          icon={<Palette className="h-5 w-5" />}
          title="Branding"
          subtitle="Theme and imagery for the guest-facing app."
        />

        <div className="mb-5">
          <span className="mb-2 block text-sm font-semibold text-ink">
            Theme
          </span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {THEME_OPTIONS.map((t) => {
              const active = form.theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => patch("theme", t.id)}
                  aria-pressed={active}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition",
                    active
                      ? "border-brand bg-brand-soft shadow-card"
                      : "border-line bg-surface hover:border-brand/50"
                  )}
                >
                  <span
                    className={cn(
                      "h-12 w-full rounded-xl bg-gradient-to-br shadow-inner",
                      t.swatch
                    )}
                  />
                  <span className="text-xs font-semibold text-ink">
                    {t.label}
                  </span>
                  {active && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-fg">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            The theme drives the look of the customer ordering app at{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-[11px] text-ink">
              /qr/.../{slug}
            </code>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Logo URL" hint="Square logo, displayed in the app header.">
            <input
              className={inputCls}
              value={form.logoUrl}
              onChange={(e) => patch("logoUrl", e.target.value)}
              placeholder="https://…/logo.png"
            />
          </Field>
          <Field label="Cover URL" hint="Wide banner shown on the menu landing.">
            <input
              className={inputCls}
              value={form.coverUrl}
              onChange={(e) => patch("coverUrl", e.target.value)}
              placeholder="https://…/cover.jpg"
            />
          </Field>
        </div>

        {supportedLangs.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Supported languages:{" "}
            <span className="font-semibold text-ink">
              {supportedLangs.map((l) => l.toUpperCase()).join(", ")}
            </span>
          </p>
        )}
      </Card>

      {/* Billing */}
      <Card>
        <SectionHeading
          icon={<Receipt className="h-5 w-5" />}
          title="Billing"
          subtitle="Service charge, tax and currency configuration."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Service charge (%)">
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              className={inputCls}
              value={form.serviceChargePct}
              onChange={(e) =>
                patch("serviceChargePct", Number(e.target.value))
              }
            />
          </Field>
          <Field label="Tax / VAT (%)">
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              className={inputCls}
              value={form.taxPct}
              onChange={(e) => patch("taxPct", Number(e.target.value))}
            />
          </Field>
          <Field label="Currency" hint="Fixed for this region.">
            <input
              className={cn(inputCls, "cursor-not-allowed bg-surface-2")}
              value={currency}
              readOnly
              aria-readonly
            />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle
            label="Tax inclusive pricing"
            description="When on, menu prices already include tax."
            checked={form.taxInclusive}
            onChange={(v) => patch("taxInclusive", v)}
          />
        </div>
      </Card>

      {/* Tipping */}
      <Card>
        <SectionHeading
          icon={<HandCoins className="h-5 w-5" />}
          title="Tipping"
          subtitle="Let guests add a tip at checkout."
        />
        <Toggle
          label="Enable tipping"
          description="Show tip presets on the payment screen."
          checked={form.tippingEnabled}
          onChange={(v) => patch("tippingEnabled", v)}
        />
        <div
          className={cn(
            "mt-4 transition",
            !form.tippingEnabled && "pointer-events-none opacity-50"
          )}
        >
          <span className="mb-2 block text-sm font-semibold text-ink">
            Tip presets (%)
          </span>
          <div className="grid grid-cols-3 gap-3 sm:max-w-md">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                type="number"
                min={0}
                max={100}
                step="1"
                disabled={!form.tippingEnabled}
                className={cn(inputCls, "text-center")}
                value={form.tipPresets[i] ?? 0}
                onChange={(e) => setTip(i, Number(e.target.value))}
                aria-label={`Tip preset ${i + 1}`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Three quick-tap percentages offered to guests.
          </p>
        </div>
      </Card>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        {error && (
          <span className="mr-auto flex items-center gap-1.5 text-sm font-medium text-danger">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
        {saved && !error && (
          <span className="mr-auto flex items-center gap-1.5 text-sm font-medium text-success">
            <Check className="h-4 w-4" />
            Settings saved
          </span>
        )}
        <Button type="submit" loading={isPending} disabled={isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
