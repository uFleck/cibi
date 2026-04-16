export function isInCurrentPayWindow(
  occurrence: string,
  now: Date,
  nextPayday: string | null,
): boolean {
  const occurrenceDate = new Date(occurrence)
  if (Number.isNaN(occurrenceDate.getTime())) return false

  if (occurrenceDate.getTime() <= now.getTime()) return false
  if (nextPayday === null) return true

  const paydayDate = new Date(`${nextPayday}T00:00:00Z`)
  if (Number.isNaN(paydayDate.getTime())) return true

  // Payday itself starts a new window, so this window is [now, payday).
  return occurrenceDate.getTime() < paydayDate.getTime()
}
