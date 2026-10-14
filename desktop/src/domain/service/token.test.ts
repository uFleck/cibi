// @vitest-environment node
// The Go token (internal/service/token.go) has no test of its own; these check the shape the Go code makes.
import { describe, expect, it } from 'vitest'
import { generatePublicToken } from './token'

describe('generatePublicToken (Go: 16 random bytes as hex)', () => {
  it('is 32 lowercase hex characters', () => {
    expect(generatePublicToken()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('differs between calls', () => {
    expect(generatePublicToken()).not.toBe(generatePublicToken())
  })
})
