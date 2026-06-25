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

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-2xl font-black tracking-tight">
          qlub<span className="text-brand">_</span>
        </span>
        <nav className="flex items-center gap-3 text-sm font-semibold">
          <Link
            href="/admin/login"
            className="rounded-full px-4 py-2 text-muted hover:text-ink"
          >
            Restaurant login
          </Link>
          <Link
            href="/qr/ae/paul-uae"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-brand-fg"
          >
            Live demo <ArrowRight size={15} />
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-12 pb-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          <Sparkles size={14} /> Scan · Order · Split · Pay — in seconds
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          The QR pay-at-table platform for modern restaurants
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Guests scan a QR code to browse the menu, order, split the bill, tip
          and pay — no app, no waiting. You get a real-time dashboard for menus,
          orders, tables, payments and reviews.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/qr/ae/paul-uae"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-3.5 font-bold text-brand-fg shadow-float"
          >
            <QrCode size={18} /> Try the guest app
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-3.5 font-bold"
          >
            <LayoutDashboard size={18} /> Open the dashboard
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">
          Demo restaurant: Paul — UAE · Admin: owner@paul.ae / password123
        </p>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <QrCode size={20} />,
              title: "QR digital menu",
              body: "Multi-menu, categories, modifiers, dietary tags, photos & 8 languages with RTL support.",
            },
            {
              icon: <Users size={20} />,
              title: "Split any way",
              body: "Pay the full bill, split evenly, pay for your own items, or a custom amount.",
            },
            {
              icon: <CreditCard size={20} />,
              title: "Pay in one tap",
              body: "Apple Pay, Google Pay, cards, Tabby and more — with tipping built in.",
            },
            {
              icon: <ReceiptText size={20} />,
              title: "Live order board",
              body: "Watch orders flow in, advance them through the kitchen, and settle bills in real time.",
            },
            {
              icon: <Star size={20} />,
              title: "Reviews & feedback",
              body: "Capture food, service and ambience ratings the moment guests pay.",
            },
            {
              icon: <ShieldCheck size={20} />,
              title: "Manage everything",
              body: "Menus, prices, availability, tables & QR codes, branding and billing — all in one place.",
            },
          ].map((f) => (
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

      {/* Stats band */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-12 text-center sm:grid-cols-4">
          {[
            ["8", "Languages"],
            ["5", "Payment methods"],
            ["< 30s", "To pay a bill"],
            ["100%", "No app needed"],
          ].map(([n, l]) => (
            <div key={l}>
              <p className="text-3xl font-black text-brand">{n}</p>
              <p className="mt-1 text-sm text-muted">{l}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-10 text-sm text-muted sm:flex-row">
        <span className="flex items-center gap-1.5">
          <Globe size={15} /> A qlub.io clone — built for demonstration.
        </span>
        <div className="flex gap-4">
          <Link href="/qr/ae/paul-uae" className="hover:text-ink">
            Guest app
          </Link>
          <Link href="/qr/ae/olive-bistro" className="hover:text-ink">
            Second venue
          </Link>
          <Link href="/admin/login" className="hover:text-ink">
            Dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}
