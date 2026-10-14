import { describe, expect, it } from 'vitest'
import { goQuote, goTrimSpace } from './strings'

describe('goTrimSpace (Go strings.TrimSpace)', () => {
  it.each([
    ['spaces and tabs', '  \tname \n', 'name'],
    ['carriage returns and vertical tabs', '\r\vname\f', 'name'],
    ['NBSP and NEL (Unicode White_Space)', ' \u0085x　', 'x'],
    ['inner spaces are kept', ' a  b ', 'a  b'],
    ['an empty result for blank input', ' \t ', ''],
  ])('%s', (_name, input, expected) => {
    expect(goTrimSpace(input)).toBe(expected)
  })

  it('does not strip U+FEFF, which Go does not treat as space', () => {
    expect(goTrimSpace('﻿name')).toBe('﻿name')
  })
})

describe('goQuote (Go fmt %q)', () => {
  it.each([
    ['plain text', 'purple-haze', '"purple-haze"'],
    ['double quote', 'a"b', '"a\\"b"'],
    ['backslash', 'a\\b', '"a\\\\b"'],
    ['newline, tab and carriage return', 'a\nb\tc\rd', '"a\\nb\\tc\\rd"'],
    ['bell escapes as \\a', 'x\x07', '"x\\a"'],
    ['other control characters as \\x', 'x\x01\x7f', '"x\\x01\\x7f"'],
    ['printable non-ASCII is kept', 'café', '"café"'],
    ['non-printable unicode as \\u', 'a​b', '"a\\u200bb"'],
    ['empty string', '', '""'],
  ])('%s', (_name, input, expected) => {
    expect(goQuote(input)).toBe(expected)
  })
})
