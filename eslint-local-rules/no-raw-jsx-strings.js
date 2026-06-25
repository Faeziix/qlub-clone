/**
 * ESLint rule: no-raw-jsx-strings
 *
 * Bans natural-language string literals that appear directly as JSX text nodes or
 * as JSX attribute values (e.g. `label="Submit"`, `placeholder="Enter name"`).
 *
 * Allowed:
 *   - Single-character or empty strings (icons, separators, punctuation like "·")
 *   - Strings that are purely numeric
 *   - Strings matching known non-translatable patterns (CSS classes, URLs, IDs,
 *     format tokens like "%", "$")
 *   - Template literals and expressions (already wrapped/computed)
 *   - aria-label attributes (covered by a11y rules elsewhere)
 *
 * This rule operates at the warn level in CI — treat it as an error via
 * `--max-warnings 0` if you want hard blocking.
 */

"use strict";

const ALLOWED_JSX_TEXT_PATTERN = /^[\s·\-–—/|.,:;!?%$#@*()\[\]{}+<>=~`^&\\0-9‌‍]*$/u;
const ALLOWED_ATTR_VALUES = /^(https?:|\/|#|%|_|--|\.|\d+|true|false|auto|none|inherit|sm|md|lg|xl|2xl)$/i;

function isAllowedString(value) {
  if (value.trim().length === 0) return true;
  if (value.trim().length <= 2) return true;
  if (/^\d+$/.test(value.trim())) return true;
  if (ALLOWED_JSX_TEXT_PATTERN.test(value.trim())) return true;
  return false;
}

const TRANSLATABLE_ATTRS = new Set([
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "label",
  "hint",
  "subtitle",
  "description",
]);

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow raw string literals in JSX — use i18n catalogs instead.",
    },
    schema: [],
    messages: {
      noRawJsxString:
        'Raw string literal "{{text}}" found in JSX. Use the i18n catalog (useTranslations / makeT) instead.',
    },
  },

  create(context) {
    return {
      JSXText(node) {
        const raw = node.value;
        if (isAllowedString(raw)) return;
        context.report({
          node,
          messageId: "noRawJsxString",
          data: { text: raw.trim().slice(0, 40) },
        });
      },

      JSXAttribute(node) {
        if (!node.name || !node.value) return;
        const attrName =
          typeof node.name.name === "string"
            ? node.name.name
            : node.name.name?.name ?? "";
        if (!TRANSLATABLE_ATTRS.has(attrName)) return;

        if (
          node.value.type === "Literal" &&
          typeof node.value.value === "string"
        ) {
          const val = node.value.value;
          if (isAllowedString(val)) return;
          if (ALLOWED_ATTR_VALUES.test(val.trim())) return;
          context.report({
            node: node.value,
            messageId: "noRawJsxString",
            data: { text: val.slice(0, 40) },
          });
        }
      },
    };
  },
};
