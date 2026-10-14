import { getCurrentWindow } from '@tauri-apps/api/window'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import {
  fetchAccounts,
  fetchTransactions,
  listGoalRecurring,
  listPaySchedules,
  type GoalRecurringDueItemResponse,
  type PayScheduleResponse,
  type TransactionResponse,
} from '@/lib/api'
import { nextPaydayAfter, parseDateOnlyUTC } from '@/lib/pay-schedule'

export interface DueItem {
  key: string
  label: string
}

export interface AccountDueData {
  paySchedules: PayScheduleResponse[]
  transactions: TransactionResponse[]
  goalRecurring: GoalRecurringDueItemResponse[]
}

const NOTIFIED_PREFIX = 'cibi.due.notified.'
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 10 * 1000
const MAX_NAMES_IN_BODY = 3

/** Milliseconds of the UTC midnight of `value` (the same UTC day convention as financial-window.ts). */
function utcDayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

/** UTC midnight of a stored date or timestamp ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ssZ"), or null when it does not parse. */
function utcDayOf(value: string | null): number | null {
  if (!value) return null
  const day = parseDateOnlyUTC(value).getTime()
  return Number.isNaN(day) ? null : day
}

/** The calendar day (UTC, YYYY-MM-DD) used both for the "due" rule and for the once-per-day dedupe. */
export function notifiedDayKey(now: Date): string {
  return `${NOTIFIED_PREFIX}${new Date(utcDayStart(now)).toISOString().slice(0, 10)}`
}

/**
 * Pure: the items of all accounts that are due at `now` and not notified yet today.
 * - pay schedule: its payday falls today (UTC). The API's next_payday is always strictly after now,
 *   so the payday is computed with nextPaydayAfter from the schedule rules.
 * - recurring transaction: next_occurrence is today or earlier (confirming advances it).
 * - installment: next_occurrence is today or earlier and installments remain unpaid.
 * - recurring goal contribution: every row returned by GET /api/goals/recurring (already the due ones).
 */
export function collectDueItems(params: {
  now: Date
  accounts: AccountDueData[]
  notifiedKeys: ReadonlySet<string>
}): DueItem[] {
  const { now, accounts, notifiedKeys } = params
  const today = utcDayStart(now)
  const items: DueItem[] = []

  for (const account of accounts) {
    for (const ps of account.paySchedules) {
      const payday = nextPaydayAfter(ps, new Date(today - 1)).getTime()
      if (payday !== today) continue
      items.push({ key: `pay:${ps.id}`, label: ps.label ?? 'Payday' })
    }

    for (const t of account.transactions) {
      const occurrence = utcDayOf(t.next_occurrence)
      if (occurrence === null || occurrence > today) continue
      if (t.is_recurring) {
        items.push({ key: `txn:${t.id}`, label: t.description })
      } else if (t.is_installment && t.paid_installments < (t.total_installments ?? 0)) {
        items.push({ key: `txn:${t.id}`, label: t.description })
      }
    }

    for (const g of account.goalRecurring) {
      items.push({ key: `goal:${g.id}`, label: `${g.goal_name} contribution` })
    }
  }

  return items.filter(item => !notifiedKeys.has(item.key))
}

/** Title and body of the due-items notification. The body lists up to 3 names, then "+K more". */
export function formatDueNotification(labels: string[]): { title: string; body: string } {
  const count = labels.length
  const shown = labels.slice(0, MAX_NAMES_IN_BODY)
  const extra = count - shown.length
  const names = extra > 0 ? [...shown, `+${extra} more`] : shown
  return {
    title: `cibi: ${count} item${count === 1 ? '' : 's'} due`,
    body: names.join(', '),
  }
}

/** The keys notified today; the keys of other days are removed from storage. */
export function loadNotifiedKeys(storage: Storage, now: Date): Set<string> {
  const today = notifiedDayKey(now)
  const keys = new Set<string>()
  const stale: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const name = storage.key(i)
    if (name?.startsWith(NOTIFIED_PREFIX) && name !== today) stale.push(name)
  }
  for (const name of stale) storage.removeItem(name)

  const raw = storage.getItem(today)
  if (raw) {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      for (const key of parsed) {
        if (typeof key === 'string') keys.add(key)
      }
    }
  }
  return keys
}

export function saveNotifiedKeys(storage: Storage, now: Date, keys: ReadonlySet<string>): void {
  storage.setItem(notifiedDayKey(now), JSON.stringify([...keys]))
}

async function loadAccountDueData(accountId: string): Promise<AccountDueData> {
  const [paySchedules, transactions, goalRecurring] = await Promise.all([
    listPaySchedules(accountId),
    fetchTransactions(accountId),
    listGoalRecurring(accountId),
  ])
  return { paySchedules, transactions, goalRecurring }
}

/** True when the main window is visible; null when the window API fails (then nothing is notified). */
async function isMainWindowVisible(): Promise<boolean | null> {
  try {
    return await getCurrentWindow().isVisible()
  } catch (err) {
    console.error('[due] window visibility check failed', err)
    return null
  }
}

/**
 * Starts the periodic due check (first run after ~10 s, then every 5 minutes) and returns a stop function.
 * Notifies only while the main window is hidden (tray), at most once per item per UTC day.
 */
export function startDueNotifications(): () => void {
  let permissionDenied = false
  let checking = false
  let stopped = false

  const ensurePermission = async (): Promise<boolean> => {
    if (permissionDenied) return false
    try {
      const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted'
      if (!granted) {
        permissionDenied = true
        console.warn('[due] notification permission not granted; notifications are off until restart')
      }
      return granted
    } catch (err) {
      permissionDenied = true
      console.error('[due] notification permission failed; notifications are off until restart', err)
      return false
    }
  }

  const check = async (): Promise<void> => {
    if (stopped || checking) return
    checking = true
    try {
      const now = new Date()
      const accounts = await fetchAccounts()
      const data = await Promise.all(accounts.map(account => loadAccountDueData(account.id)))
      const notifiedKeys = loadNotifiedKeys(window.localStorage, now)
      const due = collectDueItems({ now, accounts: data, notifiedKeys })

      let notified = 0
      if (due.length > 0) {
        const visible = await isMainWindowVisible()
        if (visible === false && await ensurePermission()) {
          const { title, body } = formatDueNotification(due.map(item => item.label))
          sendNotification({ title, body })
          for (const item of due) notifiedKeys.add(item.key)
          saveNotifiedKeys(window.localStorage, now, notifiedKeys)
          notified = due.length
        }
      }
      console.info(`[due] checked: ${due.length} due, ${notified} notified`)
    } catch (err) {
      console.error('[due] check failed', err)
    } finally {
      checking = false
    }
  }

  const firstTimer = setTimeout(() => void check(), FIRST_CHECK_DELAY_MS)
  const interval = setInterval(() => void check(), CHECK_INTERVAL_MS)

  return () => {
    stopped = true
    clearTimeout(firstTimer)
    clearInterval(interval)
  }
}
