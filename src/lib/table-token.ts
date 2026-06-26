import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { requireAuthSecret } from "./env";

const TABLE_TOKEN_ALGORITHM = "HS256";
const TABLE_TOKEN_SUBJECT = "table-access";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year — QR codes are long-lived

export interface TableTokenPayload {
  vendorId: string;
  tableId: string;
}

function tableSigningKey() {
  return new TextEncoder().encode(requireAuthSecret());
}

/**
 * Generates a cryptographically-secure 4-digit numeric passcode.
 * Uses `crypto.getRandomValues` instead of `Math.random` to ensure
 * the output is unpredictable.
 */
export function cryptoPasscode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const value = 1000 + (buf[0] % 9000);
  return String(value);
}

export interface SignTableTokenOptions {
  ttlSeconds?: number;
}

/**
 * Issues a signed JWT embedding vendorId + tableId.
 * The token is compact (JWS Compact Serialization) and HMAC-SHA256 signed
 * with the application's AUTH_SECRET, so any tampering of the payload
 * is detected by `verifyTableToken`.
 */
export async function signTableToken(
  payload: TableTokenPayload,
  options: SignTableTokenOptions = {}
): Promise<string> {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  return new SignJWT({
    vendorId: payload.vendorId,
    tableId: payload.tableId,
  })
    .setProtectedHeader({ alg: TABLE_TOKEN_ALGORITHM })
    .setSubject(TABLE_TOKEN_SUBJECT)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(tableSigningKey());
}

/**
 * Verifies a table token and returns its payload, or null if the token is
 * invalid, expired, tampered with, or signed by a different key.
 *
 * Never throws — callers treat a null return as "access denied".
 */
export async function verifyTableToken(
  token: string
): Promise<TableTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, tableSigningKey(), {
      algorithms: [TABLE_TOKEN_ALGORITHM],
      subject: TABLE_TOKEN_SUBJECT,
    });
    const vendorId = payload["vendorId"];
    const tableId = payload["tableId"];
    if (typeof vendorId !== "string" || typeof tableId !== "string") {
      return null;
    }
    return { vendorId, tableId };
  } catch {
    return null;
  }
}
