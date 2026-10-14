// Number helpers for the Go -> TypeScript port.
//
// Go's math.Round rounds half AWAY from zero (math.Round(-2.5) == -3). JS Math.round rounds
// half toward +Infinity (Math.round(-2.5) == -2). Every place the Go code calls math.Round
// goes through goRound.
//
// Money conversions (same float operations as the Go code):
//   dollars in:  goRound(dollars * 100)   e.g. int64(math.Round(req.Amount * 100))
//   dollars out: cents / 100              e.g. float64(cents) / 100.0

/** Go math.Round: rounds half away from zero. Never returns -0. */
export function goRound(x: number): number {
  const rounded = Math.sign(x) * Math.round(Math.abs(x))
  return rounded === 0 ? 0 : rounded
}

/**
 * The text Go's strconv.FormatFloat(f, 'g', -1, 64) gives, which database/sql uses to convert a
 * float64 to text (asString). Shortest digits; an exponent is used when the decimal exponent is
 * below -4 or at least 6, with at least two exponent digits ("2e+06", "1.5e-05").
 */
export function goFloatText(f: number): string {
  if (f === 0) return Object.is(f, -0) ? '-0' : '0'
  const [mantissa, exp] = f.toExponential().split('e')
  const e = Number(exp)
  if (e < -4 || e >= 6) {
    const sign = e < 0 ? '-' : '+'
    return `${mantissa}e${sign}${String(Math.abs(e)).padStart(2, '0')}`
  }
  return String(f)
}
