import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fa", "en"],
  defaultLocale: "fa",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type SupportedLocale = (typeof routing.locales)[number];

export function dirForLocale(locale: SupportedLocale | string): "rtl" | "ltr" {
  return locale === "fa" ? "rtl" : "ltr";
}
