# ADR-0007 — Review is per-Payment, not per-Order

**Status:** Accepted  
**Date:** 2026-06-26  
**Addresses:** issue #8 (Schema modernization), PRD §5 (Data model)

## Context

The original schema linked `Review` directly to an `Order` with a `@@unique([vendorId, orderId])` constraint. This worked for single-payer scenarios but broke down in split-bill situations:

- A diner who pays only their share of the bill would be blocked from leaving a review because someone else's payment already owns the review slot for the order.
- There is no way to know *which* diner paid and *which* deserves review attribution — the order is shared by the entire table.
- Review spam prevention (one review per diner per visit) needs to target the payment leg, not the order, because the payment captures the actual payer identity.

The PRD (user story #14) explicitly states: "in a split bill, each verified payer can review once."

## Decision

`Review` is linked to `Payment` via `paymentId String @unique`:

- Each `Payment` record may have at most one `Review` (`@unique` on `paymentId`).
- A diner who paid (in full or for their split share) may leave exactly one review.
- Multiple diners on a split bill can each leave a review — they each have a separate `Payment` row.
- The `Review` model retains `vendorId` for efficient vendor-scoped queries.
- The original per-Order unique constraint is removed; there is no `orderId` on `Review`.

## Consequences

- **Review ownership is unambiguous**: the payer's phone / identity (captured at payment time) is the review author.
- **Split-bill fairness**: up to N reviews per order where N is the number of split legs — this is the desired behaviour.
- **One-review-per-payer invariant**: enforced by the DB-level unique constraint on `paymentId`, not application logic.
- **Query pattern change**: to get all reviews for an order, join through `Payment` (`Order → Payment → Review`). This is one extra join but semantically correct.
- **`createReview` accepts `paymentId`**: the UI must pass `paymentId` captured from the payment confirmation response — it cannot pass `orderId` directly.

## References

- PRD issue #1, user story #14
- Issue #8 — Schema modernization
