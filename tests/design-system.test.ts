/**
 * Tests for the design system (issue #12).
 *
 * Validates:
 * - Tailwind token completeness (cta, brand, danger are separate)
 * - Font variable wiring (--font-sans, --font-display)
 * - TenantTheme preset registry
 * - buildTenantInlineVars per-restaurant CSS var injection
 */

import { describe, it, expect } from "vitest";
import { THEME_PRESETS, buildTenantInlineVars } from "@/lib/design-tokens";

describe("Tailwind config — font family tokens", () => {
  it("font-sans references --font-sans CSS variable (self-hosted Vazirmatn)", async () => {
    const config = (await import("../tailwind.config")).default as {
      theme?: { extend?: { fontFamily?: { sans?: string[]; display?: string[] } } };
    };
    const fontSans = config.theme?.extend?.fontFamily?.sans ?? [];
    expect(fontSans[0]).toBe("var(--font-sans)");
  });

  it("font-display references --font-display CSS variable", async () => {
    const config = (await import("../tailwind.config")).default as {
      theme?: { extend?: { fontFamily?: { sans?: string[]; display?: string[] } } };
    };
    const fontDisplay = config.theme?.extend?.fontFamily?.display ?? [];
    expect(fontDisplay[0]).toBe("var(--font-display)");
  });

  it("both sans and display have system-ui fallback", async () => {
    const config = (await import("../tailwind.config")).default as {
      theme?: { extend?: { fontFamily?: { sans?: string[]; display?: string[] } } };
    };
    const fontSans = config.theme?.extend?.fontFamily?.sans ?? [];
    const fontDisplay = config.theme?.extend?.fontFamily?.display ?? [];
    expect(fontSans).toContain("system-ui");
    expect(fontDisplay).toContain("system-ui");
  });
});

describe("Tailwind config — CTA token distinct from danger and brand", () => {
  type ColorsShape = {
    cta?: { DEFAULT?: string; fg?: string; soft?: string };
    brand?: { DEFAULT?: string; fg?: string; soft?: string };
    danger?: string;
    success?: string;
    warning?: string;
  };

  async function loadColors(): Promise<ColorsShape> {
    const config = (await import("../tailwind.config")).default as {
      theme?: { extend?: { colors?: ColorsShape } };
    };
    return config.theme?.extend?.colors ?? {};
  }

  it("has cta color token with DEFAULT, fg, soft", async () => {
    const colors = await loadColors();
    expect(colors.cta?.DEFAULT).toContain("var(--cta)");
    expect(colors.cta?.fg).toContain("var(--cta-fg)");
    expect(colors.cta?.soft).toContain("var(--cta-soft)");
  });

  it("cta DEFAULT uses --cta variable, not --brand or --danger", async () => {
    const colors = await loadColors();
    expect(colors.cta?.DEFAULT).not.toContain("--brand");
    expect(colors.cta?.DEFAULT).not.toContain("--danger");
    expect(colors.cta?.DEFAULT).toContain("--cta");
  });

  it("brand DEFAULT uses --brand variable, not --cta or --danger", async () => {
    const colors = await loadColors();
    expect(colors.brand?.DEFAULT).not.toContain("--cta");
    expect(colors.brand?.DEFAULT).not.toContain("--danger");
    expect(colors.brand?.DEFAULT).toContain("--brand");
  });

  it("danger uses --danger variable, not --cta or --brand", async () => {
    const colors = await loadColors();
    expect(colors.danger).not.toContain("--cta");
    expect(colors.danger).not.toContain("--brand");
    expect(colors.danger).toContain("--danger");
  });

  it("cta token in tailwind matches HSL CSS variable pattern exactly", async () => {
    const colors = await loadColors();
    expect(colors.cta?.DEFAULT).toBe("hsl(var(--cta))");
    expect(colors.cta?.fg).toBe("hsl(var(--cta-fg))");
    expect(colors.cta?.soft).toBe("hsl(var(--cta-soft))");
  });

  it("success, danger, warning tokens follow HSL var pattern", async () => {
    const colors = await loadColors();
    expect(colors.success).toBe("hsl(var(--success))");
    expect(colors.danger).toBe("hsl(var(--danger))");
    expect(colors.warning).toBe("hsl(var(--warning))");
  });
});

describe("Tailwind config — spacing and motion tokens", () => {
  async function loadExtend() {
    const config = (await import("../tailwind.config")).default as {
      theme?: {
        extend?: {
          animation?: Record<string, string>;
          maxWidth?: Record<string, string>;
        };
      };
    };
    return config.theme?.extend ?? {};
  }

  it("has animation slide-up", async () => {
    const ext = await loadExtend();
    expect(ext.animation?.["slide-up"]).toBeDefined();
  });

  it("has animation fade-in", async () => {
    const ext = await loadExtend();
    expect(ext.animation?.["fade-in"]).toBeDefined();
  });

  it("has max-width app token (480px for mobile-first layout)", async () => {
    const ext = await loadExtend();
    expect(ext.maxWidth?.app).toBe("480px");
  });
});

describe("TenantTheme preset registry", () => {
  it("exports all 5 named presets", () => {
    expect(THEME_PRESETS).toHaveLength(5);
  });

  it("contains darkgold preset", () => {
    expect(THEME_PRESETS).toContain("darkgold");
  });

  it("contains classic preset", () => {
    expect(THEME_PRESETS).toContain("classic");
  });

  it("contains emerald preset", () => {
    expect(THEME_PRESETS).toContain("emerald");
  });

  it("contains rose preset", () => {
    expect(THEME_PRESETS).toContain("rose");
  });

  it("contains midnight preset", () => {
    expect(THEME_PRESETS).toContain("midnight");
  });
});

describe("buildTenantInlineVars — per-restaurant theming via CSS vars", () => {
  it("returns empty object when no overrides given", () => {
    const vars = buildTenantInlineVars({});
    expect(Object.keys(vars)).toHaveLength(0);
  });

  it("sets --brand when brandHsl provided", () => {
    const vars = buildTenantInlineVars({ brandHsl: "10 80% 50%" });
    expect(vars["--brand"]).toBe("10 80% 50%");
  });

  it("sets --brand-fg and --brand-soft when provided", () => {
    const vars = buildTenantInlineVars({
      brandHsl: "10 80% 50%",
      brandFgHsl: "0 0% 100%",
      brandSoftHsl: "10 80% 95%",
    });
    expect(vars["--brand"]).toBe("10 80% 50%");
    expect(vars["--brand-fg"]).toBe("0 0% 100%");
    expect(vars["--brand-soft"]).toBe("10 80% 95%");
  });

  it("does not inject --cta or --danger via brand override (tokens are isolated)", () => {
    const vars = buildTenantInlineVars({ brandHsl: "10 80% 50%" });
    expect("--cta" in vars).toBe(false);
    expect("--danger" in vars).toBe(false);
  });

  it("partial overrides only set the provided variables", () => {
    const vars = buildTenantInlineVars({ brandHsl: "10 80% 50%" });
    expect(Object.keys(vars)).toEqual(["--brand"]);
  });

  it("full override sets all three brand variables", () => {
    const vars = buildTenantInlineVars({
      brandHsl: "200 60% 40%",
      brandFgHsl: "0 0% 100%",
      brandSoftHsl: "200 60% 92%",
    });
    expect(Object.keys(vars)).toHaveLength(3);
  });
});
