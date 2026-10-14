import { describe, expect, it } from 'vitest'
import { parseUuid } from './uuid'

const CANON = '75b9ae41-4ae4-4d7e-aaf9-4579aafb89cb'
const HEX32 = '1b01c415e71b90ae437d813dec6725ec' // a real ledger.id from the database

describe('parseUuid (Go uuid.Parse)', () => {
  it.each([
    ['canonical lowercase', CANON, CANON],
    ['canonical uppercase is lowercased', CANON.toUpperCase(), CANON],
    ['32 hex digits without hyphens', HEX32, '1b01c415-e71b-90ae-437d-813dec6725ec'],
    ['braces', `{${CANON}}`, CANON],
    ['urn:uuid: prefix', `urn:uuid:${CANON}`, CANON],
    ['URN prefix in any case', `URN:UUID:${CANON}`, CANON],
  ])('accepts %s', (_name, input, expected) => {
    expect(parseUuid(input)).toBe(expected)
  })

  it.each([
    ['an empty string', ''],
    ['a short string', '75b9ae41'],
    ['a 33-character string', `${HEX32}0`],
    ['hyphens in the wrong place', '75b9ae414-ae4-4d7e-aaf9-4579aafb89cb'],
    ['a non-hex character', '75b9ae41-4ae4-4d7e-aaf9-4579aafb89cg'],
    ['a 32-character string with a non-hex digit', `${HEX32.slice(0, 31)}z`],
    ['braces without the closing one', `{${CANON}`],
    ['a wrong urn prefix', `urn:uid:${CANON}`],
  ])('rejects %s', (_name, input) => {
    expect(() => parseUuid(input)).toThrow()
  })
})
