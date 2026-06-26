export const THEME_PRESETS = [
  "darkgold",
  "classic",
  "emerald",
  "rose",
  "midnight",
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number];

export interface TenantTheme {
  preset?: ThemePreset;
  brandHsl?: string;
  brandFgHsl?: string;
  brandSoftHsl?: string;
}

export function buildTenantInlineVars(theme: TenantTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  if (theme.brandHsl) vars["--brand"] = theme.brandHsl;
  if (theme.brandFgHsl) vars["--brand-fg"] = theme.brandFgHsl;
  if (theme.brandSoftHsl) vars["--brand-soft"] = theme.brandSoftHsl;
  return vars;
}
