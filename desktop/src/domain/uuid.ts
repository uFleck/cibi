// UUID helpers that match Go's github.com/google/uuid Parse.
//
// Go's uuid.Parse accepts four spellings: 36 chars (8-4-4-4-12), 38 chars with braces, 45 chars
// with a "urn:uuid:" prefix, and 32 hex digits with no hyphens. Ids in the database are not
// always canonical (some ledger rows were written as 32 hex digits), so every id read from the
// database or from a request goes through parseUuid. The result is canonical lowercase
// 8-4-4-4-12, which is what uuid.UUID.String() produces and what the Go code writes back.
//
// New ids use crypto.randomUUID(), which gives the same canonical form as uuid.New().

const CANONICAL = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const HEX32 = /^[0-9a-fA-F]{32}$/

/** Parses a UUID the way Go's uuid.Parse does, returning the canonical lowercase form. Throws on invalid input. */
export function parseUuid(input: string): string {
  if (input.length === 32) {
    if (!HEX32.test(input)) throw new Error('invalid UUID format')
    return canonical(input)
  }
  let s = input
  if (s.length === 45) {
    if (s.slice(0, 9).toLowerCase() !== 'urn:uuid:') throw new Error('invalid urn prefix')
    s = s.slice(9)
  } else if (s.length === 38) {
    if (!s.startsWith('{') || !s.endsWith('}')) throw new Error('invalid UUID format')
    s = s.slice(1, -1)
  } else if (s.length !== 36) {
    throw new Error(`invalid UUID length: ${input.length}`)
  }
  if (!CANONICAL.test(s)) throw new Error('invalid UUID format')
  return s.toLowerCase()
}

function canonical(hex: string): string {
  const h = hex.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
