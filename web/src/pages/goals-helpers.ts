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
