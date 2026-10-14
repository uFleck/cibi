import { describe, expect, it } from 'vitest'
import { HttpError } from './http'
import { validateFields, validateOrThrow, validateStruct, type FieldSpec } from './validate'

const UUID = '3f1c2a4e-9b7d-4c6a-8e21-5d0f7a9b1c33'

function fieldFailure(goName: string, rules: string) {
  return validateFields([{ goName, jsonName: goName.toLowerCase(), rules }], {})
}

describe('required', () => {
  it.each<[string, unknown]>([
    ['an empty string', ''],
    ['a zero number', 0],
    ['false', false],
    ['an absent value', undefined],
    ['null', null],
  ])('fails on %s', (_label, value) => {
    const failures = validateFields([{ goName: 'Name', jsonName: 'name', rules: 'required' }], { name: value })
    expect(failures).toEqual([{ field: 'Name', tag: 'required', param: '' }])
  })

  it.each<[string, unknown]>([
    ['a non-empty string', 'x'],
    ['a non-zero number', 7],
    ['true', true],
    ['an empty array (a non-nil slice in Go)', []],
  ])('passes on %s', (_label, value) => {
    expect(validateFields([{ goName: 'Name', jsonName: 'name', rules: 'required' }], { name: value })).toEqual([])
  })

  it('reports the first failing tag only, so required shadows gt on a zero amount', () => {
    expect(fieldFailure('Amount', 'required,gt=0')).toEqual([{ field: 'Amount', tag: 'required', param: '' }])
  })
})

describe('numeric tags on numbers', () => {
  it('gt=0 rejects 0 and negatives, accepts positives', () => {
    expect(validateFields([{ goName: 'Amount', jsonName: 'amount', rules: 'gt=0' }], { amount: 0 })).toEqual([
      { field: 'Amount', tag: 'gt', param: '0' },
    ])
    expect(validateFields([{ goName: 'Amount', jsonName: 'amount', rules: 'gt=0' }], { amount: -1 })).toHaveLength(1)
    expect(validateFields([{ goName: 'Amount', jsonName: 'amount', rules: 'gt=0' }], { amount: 0.01 })).toEqual([])
  })

  it('gte, min, lt, lte and max compare the value', () => {
    const cases: [string, number, boolean][] = [
      ['gte=5', 5, true],
      ['gte=5', 4, false],
      ['min=0', 0, true],
      ['min=0', -0.5, false],
      ['lt=5', 5, false],
      ['lt=5', 4, true],
      ['lte=5', 5, true],
      ['lte=5', 6, false],
      ['max=5', 5, true],
      ['max=5', 6, false],
    ]
    for (const [rules, value, passes] of cases) {
      const failures = validateFields([{ goName: 'N', jsonName: 'n', rules }], { n: value })
      expect(failures.length === 0, `${rules} with ${value}`).toBe(passes)
    }
  })

  it('len compares the value exactly', () => {
    expect(validateFields([{ goName: 'N', jsonName: 'n', rules: 'len=3' }], { n: 3 })).toEqual([])
    expect(validateFields([{ goName: 'N', jsonName: 'n', rules: 'len=3' }], { n: 4 })).toEqual([
      { field: 'N', tag: 'len', param: '3' },
    ])
  })
})

describe('numeric tags on strings and arrays (length, runes for strings)', () => {
  it('gt=0 on a string is a length check', () => {
    expect(validateFields([{ goName: 'S', jsonName: 's', rules: 'gt=0' }], { s: '' })).toHaveLength(1)
    expect(validateFields([{ goName: 'S', jsonName: 's', rules: 'gt=0' }], { s: 'a' })).toEqual([])
  })

  it('gte and min count characters', () => {
    expect(validateFields([{ goName: 'S', jsonName: 's', rules: 'gte=3' }], { s: 'abc' })).toEqual([])
    expect(validateFields([{ goName: 'S', jsonName: 's', rules: 'min=3' }], { s: 'ab' })).toEqual([
      { field: 'S', tag: 'min', param: '3' },
    ])
  })

  it('counts code points, not UTF-16 units (Go counts runes)', () => {
    // Two code points (U+00E9 and U+1F600), three UTF-16 units.
    expect(validateFields([{ goName: 'S', jsonName: 's', rules: 'len=2' }], { s: 'é\u{1F600}' })).toEqual([])
  })

  it('max and lte count array elements', () => {
    expect(validateFields([{ goName: 'A', jsonName: 'a', rules: 'max=1' }], { a: [1, 2] })).toEqual([
      { field: 'A', tag: 'max', param: '1' },
    ])
  })
})

describe('oneof', () => {
  const rules = 'required,oneof=weekly bi-weekly semi-monthly monthly'

  it.each(['weekly', 'bi-weekly', 'semi-monthly', 'monthly'])('accepts %s', (value) => {
    expect(validateFields([{ goName: 'Frequency', jsonName: 'frequency', rules }], { frequency: value })).toEqual([])
  })

  it('rejects a value outside the list', () => {
    expect(validateFields([{ goName: 'Frequency', jsonName: 'frequency', rules }], { frequency: 'daily' })).toEqual([
      { field: 'Frequency', tag: 'oneof', param: 'weekly bi-weekly semi-monthly monthly' },
    ])
  })

  it('rejects an absent value, which is the empty string, and does not match substrings', () => {
    expect(validateFields([{ goName: 'Frequency', jsonName: 'frequency', rules: 'oneof=weekly monthly' }], {})).toHaveLength(1)
    expect(validateFields([{ goName: 'Frequency', jsonName: 'frequency', rules: 'oneof=weekly monthly' }], { frequency: 'week' })).toHaveLength(1)
  })

  it('accepts quoted values with spaces, like go-playground', () => {
    expect(validateFields([{ goName: 'F', jsonName: 'f', rules: "oneof='a b' c" }], { f: 'a b' })).toEqual([])
  })
})

describe('uuid', () => {
  it('accepts a lowercase canonical UUID', () => {
    expect(validateFields([{ goName: 'ID', jsonName: 'id', rules: 'uuid' }], { id: UUID })).toEqual([])
  })

  it('rejects uppercase, malformed and absent values', () => {
    for (const id of [UUID.toUpperCase(), 'not-a-uuid', UUID.replace(/-/g, ''), undefined]) {
      expect(validateFields([{ goName: 'ID', jsonName: 'id', rules: 'uuid' }], { id })).toEqual([
        { field: 'ID', tag: 'uuid', param: '' },
      ])
    }
  })
})

describe('omitempty', () => {
  const rules = 'omitempty,uuid'

  it('skips the remaining tags for an empty string', () => {
    expect(validateFields([{ goName: 'ID', jsonName: 'id', rules }], { id: '' })).toEqual([])
  })

  it('skips the remaining tags for an absent value', () => {
    expect(validateFields([{ goName: 'ID', jsonName: 'id', rules }], {})).toEqual([])
  })

  it('still checks the remaining tags for a non-empty value', () => {
    expect(validateFields([{ goName: 'ID', jsonName: 'id', rules }], { id: 'x' })).toEqual([
      { field: 'ID', tag: 'uuid', param: '' },
    ])
  })

  it('treats an empty array as a value (non-nil slice), so min still runs', () => {
    expect(validateFields([{ goName: 'A', jsonName: 'a', rules: 'omitempty,min=1' }], { a: [] })).toEqual([
      { field: 'A', tag: 'min', param: '1' },
    ])
  })
})

describe('validateStruct and error text', () => {
  const fields: FieldSpec[] = [
    { goName: 'Name', jsonName: 'name', rules: 'required' },
    { goName: 'Amount', jsonName: 'amount', rules: 'required,gt=0' },
  ]

  it('returns null for a valid struct', () => {
    expect(validateStruct('CheckRequest', { name: 'Shoes', amount: 12.5 }, fields)).toBeNull()
  })

  it('formats one failure exactly like go-playground', () => {
    expect(validateStruct('CheckRequest', { name: 'Shoes', amount: -1 }, fields)).toBe(
      "Key: 'CheckRequest.Amount' Error:Field validation for 'Amount' failed on the 'gt' tag",
    )
  })

  it('joins several failures with a newline, in field order', () => {
    expect(validateStruct('CheckRequest', {}, fields)).toBe(
      [
        "Key: 'CheckRequest.Name' Error:Field validation for 'Name' failed on the 'required' tag",
        "Key: 'CheckRequest.Amount' Error:Field validation for 'Amount' failed on the 'required' tag",
      ].join('\n'),
    )
  })

  it('uses the Go field name in the text, not the JSON name', () => {
    const message = validateStruct('X', {}, [{ goName: 'AccountID', jsonName: 'account_id', rules: 'required' }])
    expect(message).toBe("Key: 'X.AccountID' Error:Field validation for 'AccountID' failed on the 'required' tag")
  })

  // Expected strings were produced by running go-playground/validator v10.30.2 (the version in go.mod)
  // on the same structs and inputs in a scratch program outside the repo.
  it('matches go-playground output for the same structs and inputs', () => {
    const checkFields: FieldSpec[] = [
      { goName: 'Name', jsonName: 'name', rules: 'required' },
      { goName: 'Amount', jsonName: 'amount', rules: 'required,gt=0' },
      { goName: 'Frequency', jsonName: 'frequency', rules: 'required,oneof=weekly bi-weekly semi-monthly monthly' },
      { goName: 'Floor', jsonName: 'floor', rules: 'min=0' },
    ]
    expect(validateStruct('CheckRequest', { name: '', amount: 0, frequency: 'daily', floor: -1 }, checkFields)).toBe(
      [
        "Key: 'CheckRequest.Name' Error:Field validation for 'Name' failed on the 'required' tag",
        "Key: 'CheckRequest.Amount' Error:Field validation for 'Amount' failed on the 'required' tag",
        "Key: 'CheckRequest.Frequency' Error:Field validation for 'Frequency' failed on the 'oneof' tag",
        "Key: 'CheckRequest.Floor' Error:Field validation for 'Floor' failed on the 'min' tag",
      ].join('\n'),
    )
    expect(validateStruct('CheckRequest', { name: 'x', amount: -1, frequency: 'weekly', floor: 0 }, checkFields)).toBe(
      "Key: 'CheckRequest.Amount' Error:Field validation for 'Amount' failed on the 'gt' tag",
    )
    expect(
      validateStruct('CheckRequest', { name: 'x', amount: 1, frequency: 'bi-weekly', floor: 0 }, checkFields),
    ).toBeNull()

    const emptyFields: FieldSpec[] = [
      { goName: 'ID', jsonName: 'id', rules: 'omitempty,uuid' },
      { goName: 'L', jsonName: 'l', rules: 'required' },
    ]
    expect(validateStruct('Empty', { id: '', l: [] }, emptyFields)).toBeNull()
    expect(validateStruct('Empty', { id: 'x', l: null }, emptyFields)).toBe(
      [
        "Key: 'Empty.ID' Error:Field validation for 'ID' failed on the 'uuid' tag",
        "Key: 'Empty.L' Error:Field validation for 'L' failed on the 'required' tag",
      ].join('\n'),
    )
  })

  it('validateOrThrow throws HttpError 400 with the same text', () => {
    let caught: unknown
    try {
      validateOrThrow('CheckRequest', { name: 'Shoes', amount: -1 }, fields)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(HttpError)
    expect((caught as HttpError).status).toBe(400)
    expect((caught as HttpError).message).toBe(
      "Key: 'CheckRequest.Amount' Error:Field validation for 'Amount' failed on the 'gt' tag",
    )
    expect((caught as HttpError).code).toBeUndefined()
  })

  it('validateOrThrow does nothing for a valid struct', () => {
    expect(() => validateOrThrow('CheckRequest', { name: 'Shoes', amount: 1 }, fields)).not.toThrow()
  })

  it('throws for a tag the validator does not support', () => {
    expect(() => validateFields([{ goName: 'E', jsonName: 'e', rules: 'email' }], { e: 'a@b.c' })).toThrow(
      "unsupported tag 'email'",
    )
  })
})
