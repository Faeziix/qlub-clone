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
import { useTranslations } from "next-intl";
import { Card } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  updateVendorSettings,
  type VendorSettingsInput,
} from "@/app/[locale]/admin/settings/actions";

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
  swatch: string;
};

export type SettingsTranslations = {
  profile: string;
  profileSubtitle: string;
  branding: string;
  brandingSubtitle: string;
  billing: string;
  billingSubtitle: string;
  tipping: string;
  tippingSubtitle: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  addressPlaceholder: string;
  descriptionPlaceholder: string;
  theme: string;
  themeHint: string;
  logoUrl: string;
  logoUrlHint: string;
  coverUrl: string;
  coverUrlHint: string;
  logoPlaceholder: string;
  coverPlaceholder: string;
  supportedLanguages: string;
  serviceCharge: string;
  taxPct: string;
  currency: string;
  currencyHint: string;
  taxInclusive: string;
  taxInclusiveHint: string;
  tippingEnabled: string;
  tippingEnabledHint: string;
  tipPresets: string;
  tipPresetsHint: string;
  saveChanges: string;
  saved: string;
  darkgold: string;
  classic: string;
  emerald: string;
  rose: string;
  midnight: string;
};

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
  t,
}: {
  vendorId: string;
  initial: FormState;
  currency: string;
  slug: string;
  supportedLangs: string[];
  t: SettingsTranslations;
}) {
  const tSettings = useTranslations("admin.settings");
  const [form, setForm] = useState<FormState>(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const THEME_OPTIONS: ThemeOption[] = [
    { id: "darkgold", label: t.darkgold, swatch: "from-amber-400 to-yellow-700" },
    { id: "classic", label: t.classic, swatch: "from-slate-200 to-slate-500" },
    { id: "emerald", label: t.emerald, swatch: "from-emerald-300 to-emerald-700" },
    { id: "rose", label: t.rose, swatch: "from-rose-300 to-rose-600" },
    { id: "midnight", label: t.midnight, swatch: "from-indigo-400 to-slate-900" },
  ];

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setErrorKey(null);
  }

  function setTip(index: number, value: number) {
    setForm((f) => {
      const next = [...f.tipPresets];
      next[index] = value;
      return { ...f, tipPresets: next };
    });
    setSaved(false);
    setErrorKey(null);
  }

  function onSave() {
    setErrorKey(null);
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
        setErrorKey(res.messageKey);
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
      <Card>
        <SectionHeading
          icon={<Store className="h-5 w-5" />}
          title={t.profile}
          subtitle={t.profileSubtitle}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.name}>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => patch("name", e.target.value)}
              placeholder={t.namePlaceholder}
              required
            />
          </Field>
          <Field label={t.email}>
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(e) => patch("email", e.target.value)}
              placeholder={t.emailPlaceholder}
            />
          </Field>
          <Field label={t.phone}>
            <input
              className={inputCls}
              value={form.phone}
              onChange={(e) => patch("phone", e.target.value)}
              placeholder={t.phonePlaceholder}
            />
          </Field>
          <Field label={t.address}>
            <input
              className={inputCls}
              value={form.address}
              onChange={(e) => patch("address", e.target.value)}
              placeholder={t.addressPlaceholder}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label={t.description}>
              <textarea
                className={cn(inputCls, "min-h-24 resize-y")}
                value={form.description}
                onChange={(e) => patch("description", e.target.value)}
                placeholder={t.descriptionPlaceholder}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeading
          icon={<Palette className="h-5 w-5" />}
          title={t.branding}
          subtitle={t.brandingSubtitle}
        />

        <div className="mb-5">
          <span className="mb-2 block text-sm font-semibold text-ink">
            {t.theme}
          </span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {THEME_OPTIONS.map((themeOpt) => {
              const active = form.theme === themeOpt.id;
              return (
                <button
                  key={themeOpt.id}
                  type="button"
                  onClick={() => patch("theme", themeOpt.id)}
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
                      themeOpt.swatch
                    )}
                  />
                  <span className="text-xs font-semibold text-ink">
                    {themeOpt.label}
                  </span>
                  {active && (
                    <span className="absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-fg">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            {t.themeHint}{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-[11px] text-ink">
              {`/qr/.../${slug}`}
            </code>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.logoUrl} hint={t.logoUrlHint}>
            <input
              className={inputCls}
              value={form.logoUrl}
              onChange={(e) => patch("logoUrl", e.target.value)}
              placeholder={t.logoPlaceholder}
            />
          </Field>
          <Field label={t.coverUrl} hint={t.coverUrlHint}>
            <input
              className={inputCls}
              value={form.coverUrl}
              onChange={(e) => patch("coverUrl", e.target.value)}
              placeholder={t.coverPlaceholder}
            />
          </Field>
        </div>

        {supportedLangs.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            {t.supportedLanguages}:{" "}
            <span className="font-semibold text-ink">
              {supportedLangs.map((l) => l.toUpperCase()).join(", ")}
            </span>
          </p>
        )}
      </Card>

      <Card>
        <SectionHeading
          icon={<Receipt className="h-5 w-5" />}
          title={t.billing}
          subtitle={t.billingSubtitle}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t.serviceCharge}>
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
          <Field label={t.taxPct}>
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
          <Field label={t.currency} hint={t.currencyHint}>
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
            label={t.taxInclusive}
            description={t.taxInclusiveHint}
            checked={form.taxInclusive}
            onChange={(v) => patch("taxInclusive", v)}
          />
        </div>
      </Card>

      <Card>
        <SectionHeading
          icon={<HandCoins className="h-5 w-5" />}
          title={t.tipping}
          subtitle={t.tippingSubtitle}
        />
        <Toggle
          label={t.tippingEnabled}
          description={t.tippingEnabledHint}
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
            {t.tipPresets}
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
                aria-label={`${t.tipPresets} ${i + 1}`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {t.tipPresetsHint}
          </p>
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        {errorKey && (
          <span className="me-auto flex items-center gap-1.5 text-sm font-medium text-danger">
            <AlertCircle className="h-4 w-4" />
            {tSettings(errorKey)}
          </span>
        )}
        {saved && !errorKey && (
          <span className="me-auto flex items-center gap-1.5 text-sm font-medium text-success">
            <Check className="h-4 w-4" />
            {t.saved}
          </span>
        )}
        <Button type="submit" loading={isPending} disabled={isPending}>
          {t.saveChanges}
        </Button>
      </div>
    </form>
  );
}
