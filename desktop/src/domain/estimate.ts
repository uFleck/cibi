// Variable-amount recurring expenses: the amount is estimated from the last payments that match.
//
// Money: integer cents. Expenses are negative, so the median of expenses is negative too.

/** How many of the latest matching payments the estimate looks at. */
export const ESTIMATE_WINDOW = 6

export type EstimateSource = 'category' | 'keyword'

export function isEstimateSource(value: string | null): value is EstimateSource {
  return value === 'category' || value === 'keyword'
}

/** The median of the values, or null when there are none. An even count averages the middle two. */
export function medianCents(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] as number
  if (sorted.length % 2 === 1) return upper
  return Math.round((((sorted[mid - 1] as number) + upper) / 2))
}
