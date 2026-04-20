function startOfUTCDate(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

export function isInCurrentPayWindow(
  occurrence: string,
  now: Date,
  nextPayday: string | null,
): boolean {
  const occurrenceDate = new Date(occurrence)
  if (Number.isNaN(occurrenceDate.getTime())) return false

  const occurrenceDay = startOfUTCDate(occurrenceDate)
  const todayDay = startOfUTCDate(now)
  if (occurrenceDay < todayDay) return false

  if (nextPayday === null) return true

  const paydayDate = new Date(`${nextPayday}T00:00:00Z`)
  if (Number.isNaN(paydayDate.getTime())) return true

  // Day-based exclusive upper boundary: [today, nextPayday).
  return occurrenceDay < startOfUTCDate(paydayDate)
}
