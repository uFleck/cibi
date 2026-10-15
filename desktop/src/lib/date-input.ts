const DATE_SEPARATOR = /[/.-]/

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dayOnly(day: number, today: Date): string | null {
  if (day < 1 || day > 31) return null
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const thisMonthDay = Math.min(day, daysInMonth(year, month))
  if (thisMonthDay >= today.getDate()) return toIso(year, month, thisMonthDay)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return toIso(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)))
}

function splitDigits(value: string): string[] | null {
  switch (value.length) {
    case 1:
    case 2:
      return [value]
    case 4:
      return [value.slice(0, 2), value.slice(2)]
    case 6:
    case 8:
      return [value.slice(0, 2), value.slice(2, 4), value.slice(4)]
    default:
      return null
  }
}

function fromParts(parts: string[], today: Date): string | null {
  const [dayText, monthText, yearText] = parts
  if (!dayText || !/^\d{1,2}$/.test(dayText)) return null
  if (monthText === undefined) return dayOnly(Number(dayText), today)
  if (!/^\d{1,2}$/.test(monthText)) return null
  if (yearText !== undefined && !/^(\d{2}|\d{4})$/.test(yearText)) return null
  const year = yearText === undefined
    ? today.getFullYear()
    : yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)
  return toIso(year, Number(monthText), Number(dayText))
}

export function parseTypedDate(text: string, today: Date = new Date()): string | null {
  const value = text.replace(/\s+/g, '')
  if (!value) return null

  const isoMatch = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(value)
  if (isoMatch) return toIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))

  if (/^\d+$/.test(value)) {
    const parts = splitDigits(value)
    return parts ? fromParts(parts, today) : null
  }

  if (!DATE_SEPARATOR.test(value)) return null
  const parts = value.split(DATE_SEPARATOR)
  if (parts.length > 3) return null
  return fromParts(parts, today)
}

export function formatDateBR(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return ''
  const [, year, month, day] = match
  if (toIso(Number(year), Number(month), Number(day)) !== iso) return ''
  return `${day}/${month}/${year}`
}
