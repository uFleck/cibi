// Error helpers for the Go -> TypeScript port. They mirror Go's error wrapping:
//
//   fmt.Errorf("op: %w", err)  ->  wrap('op', err)     message "op: <err.message>", cause err
//   errors.Is(err, ErrX)       ->  isErr(err, ErrX)    walks the cause chain, compares by identity
//   var ErrX = errors.New(...) ->  export const ErrX = new AppError('...')
//
// A sentinel must be one shared object: isErr compares identity, not message text.
// Handlers map errors to HTTP statuses the same way the Go handlers do (see handlers/*.ts).

export class AppError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
  }
}

/** The err.Error() text of any thrown value. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Mirrors fmt.Errorf("<message>: %w", err). */
export function wrap(message: string, err: unknown): AppError {
  return new AppError(`${message}: ${messageOf(err)}`, { cause: err })
}

/** Runs fn and wraps its failure as fmt.Errorf("<message>: %w", err) would. */
export async function wrapping<T>(message: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw wrap(message, err)
  }
}

/** Mirrors errors.Is: true when `sentinel` is `err` or is found in its cause chain. */
export function isErr(err: unknown, sentinel: Error): boolean {
  let current: unknown = err
  while (current !== undefined && current !== null) {
    if (current === sentinel) return true
    if (!(current instanceof Error)) return false
    current = current.cause
  }
  return false
}

/** Mirrors database/sql.ErrNoRows: a query that should return a row returned none. */
export const ErrNoRows = new AppError('sql: no rows in result set')
