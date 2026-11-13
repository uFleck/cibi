// The mascot's mood follows the money left after this period's bills, as a share of a paycheck.

export type MoneyMood = 'party' | 'happy' | 'okay' | 'worried' | 'sad'

/** Lowest share of a paycheck still free for each mood, best first. Anything below 0 is sad. */
const STEPS: readonly [MoneyMood, number][] = [
  ['party', 0.4],
  ['happy', 0.2],
  ['okay', 0.1],
]

/** Order from saddest to happiest, to tell whether a change cheered the cat up. */
export const MOOD_RANK: Record<MoneyMood, number> = { sad: 0, worried: 1, okay: 2, happy: 3, party: 4 }

export const MOOD_LINES: Record<MoneyMood, string> = {
  party: 'Sobrando bastante! Hoje tem sachê 🎉',
  happy: 'Tudo tranquilo por aqui 😺',
  okay: 'Dá pra seguir, com carinho 🐾',
  worried: 'Tá apertadinho, mas a gente dá um jeito',
  sad: 'Faltou um pouquinho... me faz um cafuné?',
}

/**
 * `free` is what is left after the bills (cents). `paycheck` is the income it is compared with;
 * without one the cat can only tell short from not short.
 */
export function moneyMood(free: number, paycheck: number): MoneyMood {
  if (free < 0) return 'sad'
  if (paycheck <= 0) return free > 0 ? 'okay' : 'worried'
  const share = free / paycheck
  for (const [mood, min] of STEPS) if (share >= min) return mood
  return 'worried'
}

/** The paycheck to compare with: this period's income, else the next one that has income. */
export function paycheckOf(periods: readonly { income: number }[]): number {
  return periods.find(period => period.income > 0)?.income ?? 0
}
