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

const FOREIGN_KEY_DRIVER_TEXT = /(?<!constraint failed: )FOREIGN KEY constraint failed(?! \(787\))/g
const FOREIGN_KEY_GO_TEXT = 'constraint failed: FOREIGN KEY constraint failed (787)'

/**
 * Gives a SQLite driver message the text the Go server shows. The Go driver (modernc.org/sqlite)
 * reports a foreign key failure as "constraint failed: FOREIGN KEY constraint failed (787)", where
 * node:sqlite (and rusqlite) report "FOREIGN KEY constraint failed". Only the driver's text is
 * rewritten, and applying it twice changes nothing.
 */
export function goDriverText(text: string): string {
  return text.replace(FOREIGN_KEY_DRIVER_TEXT, FOREIGN_KEY_GO_TEXT)
}

/** The err.Error() text of any thrown value, with the driver's constraint text as Go shows it. */
export function messageOf(err: unknown): string {
  return goDriverText(err instanceof Error ? err.message : String(err))
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
