// Port of internal/service/token.go.
//
// A 32-character lowercase hex token made from 16 bytes of cryptographically random data
// (128-bit entropy). Go's rand.Read can return an error; crypto.getRandomValues does not fail
// for a 16-byte request, so the TS form returns the string directly.

/** Go generatePublicToken: hex.EncodeToString of 16 random bytes. */
export function generatePublicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
