// Port of the go-playground/validator v10 semantics used by the Go handlers
// (validator v10.30.2, `validate:"..."` struct tags), for the JSON values they bind.
//
// Only the tags that the Go handlers use (plus the few needed by their semantics) are
// supported. Any other tag throws, so a new tag can't silently pass validation.
//
// Zero values: Go decodes a missing or null JSON field into the zero value of the struct
// field. Here absent and null values stand in for that zero value. Numeric tags compare
// 0 and string/array tags compare length 0, so both give the same outcome.

import { HttpError } from './http'

/** Go struct field name (e.g. 'Name') -> tag string (e.g. 'required,gt=0'). */
export type Rules = Record<string, string>

/** One failing field: the Go field name, the failing tag name (without its param) and the param. */
export interface ValidationFailure {
  field: string
  tag: string
  param: string
}

export interface FieldSpec {
  /** Go struct field name, used in the error text. */
  goName: string
  /** JSON property name the value is read from. */
  jsonName: string
  /** The validate tag string, e.g. 'required,gt=0'. */
  rules: string
}

interface ParsedTag {
  name: string
  param: string
}

const SUPPORTED_TAGS: ReadonlySet<string> = new Set([
  'required',
  'omitempty',
  'gt',
  'gte',
  'lt',
  'lte',
  'min',
  'max',
  'len',
  'oneof',
  'uuid',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function parseTags(rules: string): ParsedTag[] {
  return rules.split(',').map((part) => {
    const eq = part.indexOf('=')
    if (eq === -1) return { name: part, param: '' }
    return { name: part.slice(0, eq), param: part.slice(eq + 1) }
  })
}

/** Go hasValue: null/undefined are unset; slices are set when non-nil (an empty array is set); scalars are set when non-zero. */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return true
  if (typeof value === 'string') return value !== ''
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'boolean') return value
  throw new Error('validate: unsupported value type')
}

/** The length (string: rune count, array: length) or the value itself (number), as the Go numeric tags compare. */
function sizeOf(value: unknown): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'string') return [...value].length
  if (typeof value === 'number') return value
  if (Array.isArray(value)) return value.length
  throw new Error('validate: unsupported value type for a numeric tag')
}

function stringOf(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  throw new Error('validate: unsupported value type for a string tag')
}

function numericParam(param: string): number {
  const n = Number(param)
  if (param.trim() === '' || Number.isNaN(n)) {
    throw new Error(`validate: invalid numeric parameter '${param}'`)
  }
  return n
}

/** Same split as Go's oneof parser: quoted values or runs of non-space, quotes removed. */
function parseOneOf(param: string): string[] {
  return (param.match(/'[^']*'|\S+/g) ?? []).map((v) => v.replaceAll("'", ''))
}

function tagPasses(tag: ParsedTag, value: unknown): boolean {
  switch (tag.name) {
    case 'required':
      return hasValue(value)
    case 'gt':
      return sizeOf(value) > numericParam(tag.param)
    case 'gte':
    case 'min':
      return sizeOf(value) >= numericParam(tag.param)
    case 'lt':
      return sizeOf(value) < numericParam(tag.param)
    case 'lte':
    case 'max':
      return sizeOf(value) <= numericParam(tag.param)
    case 'len':
      return sizeOf(value) === numericParam(tag.param)
    case 'oneof':
      return parseOneOf(tag.param).includes(stringOf(value))
    case 'uuid':
      return UUID_RE.test(stringOf(value))
    default:
      throw new Error(`validate: unsupported tag '${tag.name}'`)
  }
}

/**
 * The first failing tag for a field, or undefined when it passes. Like go-playground,
 * tags run in order and a field reports at most one failure. `omitempty` stops the
 * check when the value is unset.
 */
function firstFailure(field: FieldSpec, value: unknown): ParsedTag | undefined {
  for (const tag of parseTags(field.rules)) {
    if (tag.name === 'omitempty') {
      if (!hasValue(value)) return undefined
      continue
    }
    if (!tagPasses(tag, value)) return tag
  }
  return undefined
}

/** Runs every field's rules against its JSON value. Failures are returned in field order. */
export function validateFields(fields: FieldSpec[], jsonValue: Record<string, unknown>): ValidationFailure[] {
  for (const field of fields) {
    for (const tag of parseTags(field.rules)) {
      if (!SUPPORTED_TAGS.has(tag.name)) {
        throw new Error(`validate: unsupported tag '${tag.name}' on ${field.goName}`)
      }
    }
  }
  const failures: ValidationFailure[] = []
  for (const field of fields) {
    const failure = firstFailure(field, jsonValue[field.jsonName])
    if (failure) {
      failures.push({ field: field.goName, tag: failure.name, param: failure.param })
    }
  }
  return failures
}

/**
 * Formats failures the way go-playground does: one line per failure,
 * `Key: 'Struct.Field' Error:Field validation for 'Field' failed on the 'tag' tag`, joined by "\n".
 * Returns null when there are no failures.
 */
export function formatValidationErrors(structName: string, failures: ValidationFailure[]): string | null {
  if (failures.length === 0) return null
  return failures
    .map(
      (f) =>
        `Key: '${structName}.${f.field}' Error:Field validation for '${f.field}' failed on the '${f.tag}' tag`,
    )
    .join('\n')
}

/** Returns the Go-format error text, or null when the struct is valid. */
export function validateStruct(
  structName: string,
  jsonValue: Record<string, unknown>,
  fields: FieldSpec[],
): string | null {
  return formatValidationErrors(structName, validateFields(fields, jsonValue))
}

/**
 * Throws HttpError 400 with the validator text when the struct is invalid.
 *
 * Matches the Go handlers, which do `if err := c.Validate(&req); err != nil { return
 * echo.NewHTTPError(http.StatusBadRequest, err.Error()) }`. The validator error is not an
 * HTTPError itself, but the handler wraps it in one with the same text, and
 * CustomHTTPErrorHandler (internal/handler/errors.go) sends that text as {"error": ...}
 * with status 400.
 */
export function validateOrThrow(
  structName: string,
  jsonValue: Record<string, unknown>,
  fields: FieldSpec[],
): void {
  const message = validateStruct(structName, jsonValue, fields)
  if (message !== null) {
    throw new HttpError(400, message)
  }
}
