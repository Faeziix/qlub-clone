/**
 * Phone normalization for Iranian mobile numbers.
 *
 * Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digit families to ASCII,
 * then normalizes to E.164 format (+98XXXXXXXXXX).
 *
 * Iranian mobile numbers come in two common forms:
 *   - Local:  09XXXXXXXXX  (11 digits starting with 09)
 *   - E.164:  +989XXXXXXXXX
 *
 * The normalizer converts local → E.164 and validates the result before
 * returning it. Throws `PhoneNormalizationError` when the input cannot be
 * parsed as a valid Iranian mobile number.
 *
 * See docs/adr/0019-guest-phone-sms-otp.md.
 */

import { normalizeDigits } from "./digit-normalizer";

export class PhoneNormalizationError extends Error {
  readonly code = "PHONE_INVALID" as const;
  constructor(raw: string) {
    super(`Cannot parse "${raw}" as a valid Iranian mobile number`);
  }
}

const IRAN_COUNTRY_CODE = "98";
const IRAN_E164_PREFIX = `+${IRAN_COUNTRY_CODE}`;

function stripFormatting(phone: string): string {
  return normalizeDigits(phone).replace(/[\s\-().]/g, "");
}

export function normalizePhoneToE164(rawPhone: string): string {
  const stripped = stripFormatting(rawPhone);

  if (stripped.startsWith(IRAN_E164_PREFIX)) {
    const withoutPlus = stripped.slice(1);
    const national = withoutPlus.slice(IRAN_COUNTRY_CODE.length);
    if (!isValidIranianMobileNational(national)) {
      throw new PhoneNormalizationError(rawPhone);
    }
    return stripped;
  }

  if (stripped.startsWith(`00${IRAN_COUNTRY_CODE}`)) {
    const national = stripped.slice(4);
    if (!isValidIranianMobileNational(national)) {
      throw new PhoneNormalizationError(rawPhone);
    }
    return `+${stripped.slice(2)}`;
  }

  if (stripped.startsWith("09") && stripped.length === 11) {
    const national = stripped.slice(1);
    if (!isValidIranianMobileNational(national)) {
      throw new PhoneNormalizationError(rawPhone);
    }
    return `${IRAN_E164_PREFIX}${national}`;
  }

  throw new PhoneNormalizationError(rawPhone);
}

function isValidIranianMobileNational(national: string): boolean {
  return /^9[0-9]{9}$/.test(national);
}

export function isIranianMobilePhone(rawPhone: string): boolean {
  try {
    normalizePhoneToE164(rawPhone);
    return true;
  } catch {
    return false;
  }
}
