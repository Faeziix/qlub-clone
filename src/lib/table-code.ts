const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PUBLIC_ID_CHAR_COUNT = 8;
const PUBLIC_ID_BIT_LENGTH = PUBLIC_ID_CHAR_COUNT * 5; // 40 bits
const PUBLIC_ID_BYTE_COUNT = PUBLIC_ID_BIT_LENGTH / 8; // 5 bytes

const LOOK_ALIKE_MAP: Record<string, string> = {
  I: "1",
  L: "1",
  O: "0",
};

function encodeCrockfordBase32(bytes: Uint8Array): string {
  const n =
    (BigInt(bytes[0]) << 32n) |
    (BigInt(bytes[1]) << 24n) |
    (BigInt(bytes[2]) << 16n) |
    (BigInt(bytes[3]) << 8n) |
    BigInt(bytes[4]);

  let code = "";
  for (let shift = (PUBLIC_ID_CHAR_COUNT - 1) * 5; shift >= 0; shift -= 5) {
    code += CROCKFORD_ALPHABET[Number((n >> BigInt(shift)) & 31n)];
  }
  return code;
}

export function generateTablePublicId(): string {
  const bytes = new Uint8Array(PUBLIC_ID_BYTE_COUNT);
  crypto.getRandomValues(bytes);
  return encodeCrockfordBase32(bytes);
}

export function normalizeTablePublicId(raw: string): string {
  const stripped = raw.replace(/[-\s]/g, "").toUpperCase();
  let normalized = "";
  for (const ch of stripped) {
    normalized += LOOK_ALIKE_MAP[ch] ?? ch;
  }
  return normalized;
}

export function isValidTablePublicId(id: string): boolean {
  if (id.length !== PUBLIC_ID_CHAR_COUNT) return false;
  return [...id].every((ch) => CROCKFORD_ALPHABET.includes(ch));
}
