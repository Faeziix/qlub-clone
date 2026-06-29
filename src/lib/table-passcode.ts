export function cryptoPasscode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const value = 1000 + (buf[0] % 9000);
  return String(value);
}
