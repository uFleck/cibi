function startOfUTCDate(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

export function isInCurrentPayWindow(
  occurrence: string,
  _now: Date,
  nextPayday: string | null,
): boolean {
  const occurrenceDate = new Date(occurrence)
  if (Number.isNaN(occurrenceDate.getTime())) return false

  const occurrenceDay = startOfUTCDate(occurrenceDate)

  if (nextPayday === null) return true

  const paydayDate = new Date(`${nextPayday}T00:00:00Z`)
  if (Number.isNaN(paydayDate.getTime())) return true

  // Keep due/overdue recurring obligations visible until confirmed.
  // Exclusive upper boundary remains next payday day.
  return occurrenceDay < startOfUTCDate(paydayDate)
}
