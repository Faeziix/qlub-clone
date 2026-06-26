/**
 * getPaymentProvider — returns the active PaymentProvider adapter.
 *
 * The active adapter is selected by the PAYMENT_PROVIDER environment variable:
 *   - unset or "simulated" or "sandbox" → SimulatedPaymentAdapter (default)
 *   - "zarinpal" → ZarinpalAdapter (added under issue #5 when the live
 *     facilitator is chosen — do not add here until then)
 *
 * This default ensures the app, build, and tests run with no external account.
 * Adding a new provider requires: (1) a concrete adapter implementing
 * PaymentProvider, (2) a new case below, (3) re-verified API contract per §6.1
 * of the PRD (field names, result codes, ceilings — must be checked against
 * live docs before adding).
 *
 * The simulated adapter is a module-level singleton so gateway sessions
 * (stored in-memory) persist across HTTP requests within the same Node.js
 * process (development and test only). Without this, the verify() call in the
 * payment callback would hit a fresh instance with no sessions.
 */

import type { PaymentProvider } from "./provider";
import { SimulatedPaymentAdapter } from "./adapters/simulated";

let _simulatedInstance: SimulatedPaymentAdapter | null = null;

function simulatedProvider(): SimulatedPaymentAdapter {
  if (!_simulatedInstance) {
    _simulatedInstance = new SimulatedPaymentAdapter();
  }
  return _simulatedInstance;
}

export function getPaymentProvider(): PaymentProvider {
  const providerKey = process.env.PAYMENT_PROVIDER?.toLowerCase() ?? "simulated";

  switch (providerKey) {
    case "simulated":
    case "sandbox":
      return simulatedProvider();

    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER="${providerKey}". ` +
          `Valid values: simulated, sandbox. ` +
          `Live facilitator adapters are added under issue #5.`
      );
  }
}

/** Test / dev helper: discard the singleton so each test starts with a fresh adapter. */
export function resetPaymentProviderForTesting(): void {
  _simulatedInstance = null;
}
