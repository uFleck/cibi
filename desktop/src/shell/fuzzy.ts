export function fuzzyMatch(query: string, text: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = text.toLowerCase()
  let position = 0
  for (const char of needle) {
    position = haystack.indexOf(char, position)
    if (position === -1) return false
    position += 1
  }
  return true
}
