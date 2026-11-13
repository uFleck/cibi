/** The local calendar day as YYYY-MM-DD. Money dates are calendar days, not UTC instants. */
export function todayIso(): string {
  const now = new Date()
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** The local calendar day of an instant stored as RFC3339. */
export function localDayOf(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return iso.slice(0, 10)
  const year = String(value.getFullYear()).padStart(4, '0')
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
