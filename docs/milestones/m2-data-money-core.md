# M2 — Data & Money Core

## Overview

This milestone establishes the foundational data model and money handling required for production-grade Iran operations.

## Issues

| # | Title | Status |
|---|-------|--------|
| [#9](https://github.com/Faeziix/qlub-clone/issues/9) | Server-authoritative pricing + honored-price rule + concurrency + idempotency | ready-for-agent |
| [#8](https://github.com/Faeziix/qlub-clone/issues/8) | Schema modernization — enums, JSON, Iran defaults, translations, orderNumber, audit | ready-for-agent |
| [#7](https://github.com/Faeziix/qlub-clone/issues/7) | Integer-rial money model (money.ts deep module) + property tests | ready-for-agent |
| [#6](https://github.com/Faeziix/qlub-clone/issues/6) | Postgres migration + real migrations + DR baseline | ready-for-agent |
| [#5](https://github.com/Faeziix/qlub-clone/issues/5) | Legal & provider critical path — entity, eNamad, commission legality, providers, float | blocked-on-human |

## Blocked decisions (HITL)

### Issue #5 — Legal & provider critical path

Requires human decisions before agent can implement:

- Iranian legal entity + bank account established
- eNamad + business license obtained (or in-progress with owner + timeline)
- Written legal opinion on commission legality recorded; `COMMISSION_MODE` (split vs B2B-invoice) decided
- Primary + fallback payment facilitator and SMS provider selected
- Platform-wallet float source and size decided
- Foreign-investor/sanctions-exposure decision recorded at board level

Once decisions are made: remove `hitl` and `blocked-on-human` labels from issue #5 to unblock agent implementation.
