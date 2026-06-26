# Project documentation

Living documentation for the Qlub Iran product. Update the relevant page (and
add an ADR) whenever you change the behavior it describes.

## Contents

- [security.md](./security.md) — secrets, environment variables, admin sessions,
  demo-account gating, and the repo-safety regression guard.
- [tooling.md](./tooling.md) — package manager, Node version pin, CI, env vars.
- [design-system.md](./design-system.md) — Vazirmatn font, color tokens, CVA primitives,
  RTL logical properties, per-restaurant theming, and component conventions.

## Architecture Decision Records

ADRs live in [`adr/`](./adr). Each records the context, decision, and
consequences of a significant choice.

- [0001 — Repo safety hardening](./adr/0001-repo-safety-hardening.md)
- [0002 — Tables-actions IDOR fix](./adr/0002-tables-actions-idor-fix.md)
- [0003 — Tooling standardisation](./adr/0003-tooling-standardisation.md)
- [0010 — next-intl Farsi-first RTL foundation](./adr/0010-nextintl-farsi-first-rtl-foundation.md)
- [0011 — Persian formatting deep modules](./adr/0011-persian-formatting-deep-modules.md)
- [0012 — Design system: Vazirmatn, CVA, RTL, theming](./adr/0012-design-system-vazirmatn-cva-rtl.md)
