// JSON request binding for the handlers. It stands in for Echo's c.Bind into the Go request
// struct, following encoding/json:
// - A key matches a field by exact name first, else case-insensitively. Keys are read in
//   document order and the last one wins.
// - An absent field, or null, gives the Go zero value: "" for strings, 0 for numbers, false for
//   bools. A pointer field (Go *T) is nil instead: null. A null value does not change a
//   non-pointer field that an earlier key already set.
// - A missing body, or a JSON null body, gives all zero values. A body that is not an object
//   (an array, a number, a string, a boolean) is an error.
// - A value of the wrong JSON type is an error, as are numbers that do not fit the Go type
//   (a float64 that is not finite, an int64 with a fraction).
// Any binding error is a 400. Echo's message text (the Go decoder's error) is not reproduced,
// so the body is {"error": "invalid request body"} (see http.ts for the same choice).

import { HttpError } from '../http'

/** Go field types as the request structs declare them. */
export type BindKind = 'string' | 'float' | 'int' | 'bool' | 'stringPtr' | 'floatPtr' | 'intPtr'

interface BindTypes {
  string: string
  float: number
  int: number
  bool: boolean
  stringPtr: string | null
  floatPtr: number | null
  intPtr: number | null
}

/** The TS type of each bound field. */
export type Bound<S extends Record<string, BindKind>> = { [K in keyof S]: BindTypes[S[K]] }

const INVALID_BODY = 'invalid request body'

const ZERO: { [K in BindKind]: BindTypes[K] } = {
  string: '',
  float: 0,
  int: 0,
  bool: false,
  stringPtr: null,
  floatPtr: null,
  intPtr: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPointer(kind: BindKind): boolean {
  return kind === 'stringPtr' || kind === 'floatPtr' || kind === 'intPtr'
}

/** True when a non-null JSON value has the JSON type the Go field needs. */
function fits(kind: BindKind, value: unknown): boolean {
  switch (kind) {
    case 'string':
    case 'stringPtr':
      return typeof value === 'string'
    case 'float':
    case 'floatPtr':
      return typeof value === 'number' && Number.isFinite(value)
    case 'int':
    case 'intPtr':
      return typeof value === 'number' && Number.isInteger(value)
    case 'bool':
      return typeof value === 'boolean'
  }
}

function matchField(schema: Record<string, BindKind>, key: string): string | undefined {
  if (Object.hasOwn(schema, key)) return key
  const folded = key.toLowerCase()
  return Object.keys(schema).find((name) => name.toLowerCase() === folded)
}

/**
 * Binds a JSON body into the struct described by `schema` (JSON name -> Go field type).
 * Throws HttpError 400 when the body does not decode into the struct.
 */
export function bindBody<S extends Record<string, BindKind>>(body: unknown, schema: S): Bound<S> {
  const fields: Record<string, BindKind> = schema
  const out: Record<string, unknown> = {}
  for (const name of Object.keys(fields)) {
    const kind = fields[name]
    out[name] = kind === undefined ? undefined : ZERO[kind]
  }
  if (body === undefined || body === null) return out as Bound<S>
  if (!isRecord(body)) throw new HttpError(400, INVALID_BODY)

  for (const [key, value] of Object.entries(body)) {
    const name = matchField(fields, key)
    if (name === undefined) continue
    const kind = fields[name]
    if (kind === undefined) continue
    if (value === null) {
      if (isPointer(kind)) out[name] = null
      continue
    }
    if (!fits(kind, value)) throw new HttpError(400, INVALID_BODY)
    out[name] = value
  }
  // out holds exactly one value of the type BindTypes gives each schema key.
  return out as Bound<S>
}
