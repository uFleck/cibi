export const APP_LOCALE = 'pt-BR'

export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  return value.includes('T') ? value.split('T')[0] : value
}

export function fromDateInputValue(value?: string | null): string | undefined {
  if (!value) return undefined
  return `${value}T00:00:00Z`
}

export function formatTimeUTC(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(APP_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  })
}
