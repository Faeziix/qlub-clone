/**
 * SMS provider abstraction — two production adapters (primary/fallback) behind
 * one `SmsProvider` interface, plus a console/dev adapter that logs the OTP
 * code instead of sending it. The correct adapter is selected at runtime from
 * env; when no credentials are present the adapter reports `unavailable` so
 * the calling code can exercise the graceful-degradation path (OTP skipped,
 * payment proceeds).
 *
 * Approved message templates are defined here; provider adapters MUST use one
 * of them verbatim to comply with Iranian SMS operator filtering rules.
 *
 * See docs/adr/0019-guest-phone-sms-otp.md.
 */

export interface SmsSendInput {
  toE164: string;
  code: string;
}

export type SmsSendResult =
  | { sent: true }
  | { sent: false; reason: "unavailable" | "failed"; detail?: string };

export interface SmsProvider {
  name: string;
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

const OTP_TEMPLATE_FA = (code: string) =>
  `کد تأیید qlub شما: ${code}\nاین کد ۲ دقیقه اعتبار دارد.`;

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";

  async send({ toE164, code }: SmsSendInput): Promise<SmsSendResult> {
    console.info(
      `[SMS:console] OTP for ${toE164}: ${code} | message: "${OTP_TEMPLATE_FA(code)}"`
    );
    return { sent: true };
  }
}

function buildPrimaryAdapter(): SmsProvider | null {
  const apiKey = process.env.SMS_PRIMARY_API_KEY;
  const lineNumber = process.env.SMS_PRIMARY_LINE_NUMBER;
  const apiUrl = process.env.SMS_PRIMARY_API_URL;

  if (!apiKey || !lineNumber || !apiUrl) return null;

  return {
    name: "primary",
    async send({ toE164, code }): Promise<SmsSendResult> {
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            receptor: toE164,
            sender: lineNumber,
            message: OTP_TEMPLATE_FA(code),
          }),
        });
        if (!res.ok) {
          return {
            sent: false,
            reason: "failed",
            detail: `HTTP ${res.status}`,
          };
        }
        return { sent: true };
      } catch (err) {
        return {
          sent: false,
          reason: "failed",
          detail: err instanceof Error ? err.message : "unknown",
        };
      }
    },
  };
}

function buildFallbackAdapter(): SmsProvider | null {
  const apiKey = process.env.SMS_FALLBACK_API_KEY;
  const lineNumber = process.env.SMS_FALLBACK_LINE_NUMBER;
  const apiUrl = process.env.SMS_FALLBACK_API_URL;

  if (!apiKey || !lineNumber || !apiUrl) return null;

  return {
    name: "fallback",
    async send({ toE164, code }): Promise<SmsSendResult> {
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            to: toE164,
            from: lineNumber,
            text: OTP_TEMPLATE_FA(code),
          }),
        });
        if (!res.ok) {
          return {
            sent: false,
            reason: "failed",
            detail: `HTTP ${res.status}`,
          };
        }
        return { sent: true };
      } catch (err) {
        return {
          sent: false,
          reason: "failed",
          detail: err instanceof Error ? err.message : "unknown",
        };
      }
    },
  };
}

const unavailableProvider: SmsProvider = {
  name: "unavailable",
  async send(): Promise<SmsSendResult> {
    return { sent: false, reason: "unavailable" };
  },
};

export function buildSmsProvider(): SmsProvider {
  const primary = buildPrimaryAdapter();
  const fallback = buildFallbackAdapter();

  if (!primary && !fallback) {
    if (process.env.NODE_ENV !== "production") {
      return new ConsoleSmsProvider();
    }
    return unavailableProvider;
  }

  return {
    name: "chain",
    async send(input): Promise<SmsSendResult> {
      if (primary) {
        const result = await primary.send(input);
        if (result.sent) return result;
      }
      if (fallback) {
        const result = await fallback.send(input);
        if (result.sent) return result;
      }
      return { sent: false, reason: "unavailable" };
    },
  };
}

let _smsProvider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!_smsProvider) {
    _smsProvider = buildSmsProvider();
  }
  return _smsProvider;
}

export function resetSmsProviderForTesting(provider: SmsProvider): void {
  _smsProvider = provider;
}
