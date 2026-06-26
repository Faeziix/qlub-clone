import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing, dirForLocale } from "@/i18n/routing";

const vazirmatn = localFont({
  src: [
    {
      path: "../../../public/fonts/vazirmatn-arabic-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../../public/fonts/vazirmatn-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "qlub_ | اسکن. سفارش. پرداخت.",
  description:
    "پلتفرم پرداخت و سفارش QR برای رستوران‌ها — منو را ببینید، سفارش دهید، صورتحساب را تقسیم کنید و در چند ثانیه پرداخت کنید.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#8a6d2f",
  width: "device-width",
  initialScale: 1,
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const dir = dirForLocale(locale);

  return (
    <html lang={locale} dir={dir} className={`${vazirmatn.variable} font-sans`}>
      <body>{children}</body>
    </html>
  );
}
