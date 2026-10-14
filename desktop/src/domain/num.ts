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
