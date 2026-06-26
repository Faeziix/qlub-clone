/**
 * Free-text sanitization for user-supplied fields that may appear in admin views.
 *
 * Fields sanitized: `notes`, `comment`, `guestName` (any free-text column).
 *
 * Strategy: strip HTML entirely rather than allow-listing tags — the product has
 * no use for rich text in these fields, and stripping is simpler to reason about
 * than a tag allow-list. The approach:
 *   1. Strip `<script>…</script>` blocks (including content).
 *   2. Strip all remaining HTML tags via a tag-pattern regex.
 *   3. Strip javascript: URLs.
 *   4. Collapse excess whitespace and trim.
 *   5. Truncate to maxLength (default 2000) to match the zod schema cap.
 *
 * This runs server-side before persisting. A secondary layer of output encoding
 * (React's JSX escaping) is the defence-in-depth at render time.
 */

const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const HTML_TAG_RE = /<[^>]+>/g;
const JAVASCRIPT_PROTOCOL_RE = /javascript\s*:/gi;

export function sanitizeFreeText(
  input: string | null | undefined,
  maxLength = 2000
): string {
  if (input == null) return "";
  return input
    .replace(SCRIPT_BLOCK_RE, "")
    .replace(HTML_TAG_RE, "")
    .replace(JAVASCRIPT_PROTOCOL_RE, "")
    .trim()
    .slice(0, maxLength);
}
