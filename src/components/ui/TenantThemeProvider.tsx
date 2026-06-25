"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { THEME_PRESETS, buildTenantInlineVars, type ThemePreset, type TenantTheme } from "@/lib/design-tokens";

interface TenantThemeProviderProps {
  theme: TenantTheme;
  dir?: "rtl" | "ltr";
  children: React.ReactNode;
  className?: string;
}

function TenantThemeProvider({
  theme,
  dir,
  children,
  className,
}: TenantThemeProviderProps) {
  const presetClass = theme.preset ? `theme-${theme.preset}` : undefined;
  const inlineVars = buildTenantInlineVars(theme);
  const hasInlineOverrides = Object.keys(inlineVars).length > 0;

  return (
    <div
      className={cn(presetClass, className)}
      style={hasInlineOverrides ? (inlineVars as React.CSSProperties) : undefined}
      dir={dir}
      data-tenant-theme={theme.preset ?? "custom"}
    >
      {children}
    </div>
  );
}

export { TenantThemeProvider, THEME_PRESETS };
export type { TenantThemeProviderProps, ThemePreset, TenantTheme };
