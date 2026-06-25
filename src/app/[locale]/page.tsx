import Link from "next/link";
import {
  QrCode,
  CreditCard,
  Users,
  Sparkles,
  ArrowRight,
  Star,
  Globe,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("landing");

  const features = [
    {
      icon: <QrCode size={20} />,
      title: t("featureQrTitle"),
      body: t("featureQrBody"),
    },
    {
      icon: <Users size={20} />,
      title: t("featureSplitTitle"),
      body: t("featureSplitBody"),
    },
    {
      icon: <CreditCard size={20} />,
      title: t("featurePayTitle"),
      body: t("featurePayBody"),
    },
    {
      icon: <ReceiptText size={20} />,
      title: t("featureOrdersTitle"),
      body: t("featureOrdersBody"),
    },
    {
      icon: <Star size={20} />,
      title: t("featureReviewsTitle"),
      body: t("featureReviewsBody"),
    },
    {
      icon: <ShieldCheck size={20} />,
      title: t("featureManageTitle"),
      body: t("featureManageBody"),
    },
  ];

  const stats = [
    ["2", t("statLanguages")],
    ["2", t("statPayments")],
    ["< 30s", t("statSpeed")],
    ["100%", t("statNoApp")],
  ] as const;

  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-2xl font-black tracking-tight">
          {"qlub"}<span className="text-brand">{"_"}</span>
        </span>
        <nav className="flex items-center gap-3 text-sm font-semibold">
          <Link
            href="/admin/login"
            className="rounded-full px-4 py-2 text-muted hover:text-ink"
          >
            {t("restaurantLogin")}
          </Link>
          <Link
            href="/qr/ir/demo-tehran"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-brand-fg"
          >
            {t("liveDemo")} <ArrowRight size={15} />
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-12 pb-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          <Sparkles size={14} /> {t("tagline")}
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          {t("heroTitle")}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          {t("heroBody")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/qr/ir/demo-tehran"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-3.5 font-bold text-brand-fg shadow-float"
          >
            <QrCode size={18} /> {t("tryGuestApp")}
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-3.5 font-bold"
          >
            <LayoutDashboard size={18} /> {t("openDashboard")}
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">{t("demoHint")}</p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-line bg-surface p-6 shadow-card"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                {f.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-12 text-center sm:grid-cols-4">
          {stats.map(([n, l]) => (
            <div key={l}>
              <p className="text-3xl font-black text-brand">{n}</p>
              <p className="mt-1 text-sm text-muted">{l}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-10 text-sm text-muted sm:flex-row">
        <span className="flex items-center gap-1.5">
          <Globe size={15} /> {t("footerCredit")}
        </span>
        <div className="flex gap-4">
          <Link href="/qr/ir/demo-tehran" className="hover:text-ink">
            {t("navGuestApp")}
          </Link>
          <Link href="/admin/login" className="hover:text-ink">
            {t("navDashboard")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
