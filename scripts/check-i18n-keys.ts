/**
 * CI gate: verify that every key present in messages/en.json also exists in
 * messages/fa.json with a non-empty value, and vice versa.
 *
 * Exits 1 if any keys are missing or blank; exits 0 if all catalogs are complete.
 *
 * Usage:  bun run scripts/check-i18n-keys.ts
 */

import enMessages from "../messages/en.json";
import faMessages from "../messages/fa.json";

type JsonObject = Record<string, unknown>;

function flattenKeys(obj: JsonObject, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = flattenKeys(value as JsonObject, fullKey);
      for (const [k, v] of nested) result.set(k, v);
    } else {
      result.set(fullKey, String(value ?? ""));
    }
  }
  return result;
}

const enKeys = flattenKeys(enMessages as unknown as JsonObject);
const faKeys = flattenKeys(faMessages as unknown as JsonObject);

const errors: string[] = [];

for (const [key, enValue] of enKeys) {
  if (!faKeys.has(key)) {
    errors.push(`MISSING in fa: "${key}" (en value: "${enValue}")`);
  } else {
    const faValue = faKeys.get(key)!;
    if (!faValue.trim()) {
      errors.push(`EMPTY in fa: "${key}"`);
    }
  }
}

for (const [key, faValue] of faKeys) {
  if (!enKeys.has(key)) {
    errors.push(`MISSING in en: "${key}" (fa value: "${faValue}")`);
  }
}

if (errors.length > 0) {
  console.error("❌  i18n key check failed — fix the following issues:\n");
  for (const err of errors) {
    console.error(`  • ${err}`);
  }
  console.error(`\n${errors.length} issue(s) found.`);
  process.exit(1);
} else {
  const keyCount = enKeys.size;
  console.log(`✓  i18n catalog complete — ${keyCount} keys verified across fa + en.`);
  process.exit(0);
}
