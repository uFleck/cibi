// String helpers that match Go's strings and fmt behavior.
//
// goTrimSpace follows Go's unicode.IsSpace (the Unicode White_Space set). JS String.trim also
// strips U+FEFF, which Go does not treat as space, so trim() is not used.
//
// goQuote follows fmt's %q (strconv.Quote) for the strings the Go code formats into error text.

const SPACE = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const LEADING_SPACE = new RegExp(`^[${SPACE}]+`)
const TRAILING_SPACE = new RegExp(`[${SPACE}]+$`)

/** Go strings.TrimSpace. */
export function goTrimSpace(s: string): string {
  return s.replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '')
}

const SIMPLE_ESCAPES: Record<string, string> = {
  '\x07': '\\a',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\v': '\\v',
  '"': '\\"',
  '\\': '\\\\',
}

// Go's IsPrint: letters, marks, numbers, punctuation, symbols, and the ASCII space.
const PRINTABLE = /[\p{L}\p{M}\p{N}\p{P}\p{S}\x20]/u

/** Go fmt %q for a string: double quotes, Go escapes. */
export function goQuote(s: string): string {
  let out = '"'
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    const simple = SIMPLE_ESCAPES[ch]
    if (simple !== undefined) {
      out += simple
    } else if (cp < 0x20 || cp === 0x7f) {
      out += `\\x${cp.toString(16).padStart(2, '0')}`
    } else if (PRINTABLE.test(ch)) {
      out += ch
    } else if (cp < 0x10000) {
      out += `\\u${cp.toString(16).padStart(4, '0')}`
    } else {
      out += `\\U${cp.toString(16).padStart(8, '0')}`
    }
  }
  return `${out}"`
}
