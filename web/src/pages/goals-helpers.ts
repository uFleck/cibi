/**
 * Parses a quick contribution amount from a raw string.
 * Accepts Brazilian comma decimals (e.g. "12,50" → 12.5).
 * Returns null for blank, non-finite, zero, or negative values.
 */
export function parseContributionAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function sourceVariant(source: string): 'default' | 'secondary' | 'outline' {
  if (source === 'manual') return 'default'
  if (source === 'recurring') return 'outline'
  return 'secondary'
}

export function progressTone(progress: number): string {
  if (progress >= 80) return 'bg-[var(--color-verdict-yes)]'
  if (progress >= 40) return 'bg-[var(--color-risk-medium)]'
  return 'bg-[var(--color-risk-high)]'
}

export function formatUpdatedCue(updatedAtUtc?: string): string | null {
  if (!updatedAtUtc) return null
  return `Updated ${new Date(updatedAtUtc).toLocaleTimeString()}`
}
