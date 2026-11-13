// Fills a throwaway design database with a realistic plan. Run it with the app closed, or reload the
// webview after it. It never touches the real database unless CIBI_DB_PATH points at it.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

const path = process.env.CIBI_DB_PATH
if (!path) {
  console.error('CIBI_DB_PATH is not set')
  process.exit(1)
}

const db = new DatabaseSync(path)

function ymd(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10)
}
function plusDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return ymd(d)
}
function monthsAgo(months) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return ymd(d)
}
function insertTransaction(row) {
  const id = row.id ?? randomUUID()
  db.prepare(
    `INSERT INTO "Transaction" (id, account_id, type, friend_id, amount, title, timestamp, is_recurring,
      frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at, is_installment,
      total_installments, paid_installments, skipped_installments, is_uncertain, is_as_needed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
  ).run(
    id,
    row.account_id,
    row.type ?? 'personal',
    row.friend_id ?? null,
    row.amount,
    row.title,
    row.timestamp ?? new Date().toISOString(),
    row.is_recurring ? 1 : 0,
    row.frequency ?? null,
    row.anchor_date ?? null,
    row.next_occurrence ?? null,
    row.requires_confirmation ? 1 : 0,
    row.confirmed_at ?? null,
    row.is_installment ? 1 : 0,
    row.total_installments ?? null,
    row.paid_installments ?? 0,
    row.is_as_needed ? 1 : 0,
  )
  return id
}

const existing = db.prepare('SELECT id FROM Account LIMIT 1').get()
if (existing) {
  console.log('database already has an account; nothing to seed')
  db.close()
  process.exit(0)
}

const accountId = randomUUID()
const friendId = randomUUID()
const today = ymd(new Date())

db.prepare(`INSERT INTO Account (id, name, current_balance, currency, safety_buffer) VALUES (?, ?, ?, 'BRL', 0)`).run(
  accountId,
  'Casa',
  250000,
)
db.prepare(
  `INSERT INTO ledger (id, account_id, entry_type, amount, description, posted_at) VALUES (?, ?, 'opening_balance', 250000, 'Saldo inicial', ?)`,
).run(randomUUID(), accountId, new Date().toISOString())

db.prepare(
  `INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, day_of_month2, label, amount)
   VALUES (?, ?, 'semi-monthly', ?, 28, 'Salário', 350000)`,
).run(randomUUID(), accountId, today)

insertTransaction({
  account_id: accountId,
  amount: -180000,
  title: 'Aluguel',
  is_recurring: true,
  frequency: 'monthly',
  anchor_date: plusDays(2),
  next_occurrence: plusDays(2),
  requires_confirmation: true,
})
insertTransaction({
  account_id: accountId,
  amount: -90000,
  title: 'Cartão',
  is_recurring: true,
  frequency: 'monthly',
  anchor_date: plusDays(12),
  next_occurrence: plusDays(12),
  requires_confirmation: true,
})
insertTransaction({
  account_id: accountId,
  amount: -15000,
  title: 'Luz',
  is_recurring: true,
  frequency: 'monthly',
  anchor_date: plusDays(7),
  next_occurrence: plusDays(7),
  requires_confirmation: true,
})
insertTransaction({
  account_id: accountId,
  amount: -60000,
  title: 'Mercado',
  is_recurring: true,
  frequency: 'monthly',
  anchor_date: today,
  next_occurrence: today,
  is_as_needed: true,
  requires_confirmation: true,
})
insertTransaction({
  account_id: accountId,
  amount: -10000,
  title: 'Celular',
  is_installment: true,
  frequency: 'monthly',
  anchor_date: monthsAgo(2),
  total_installments: 6,
  paid_installments: 2,
  requires_confirmation: true,
})
insertTransaction({
  account_id: accountId,
  amount: -20000,
  title: 'Presente',
  anchor_date: plusDays(5),
  next_occurrence: plusDays(5),
  requires_confirmation: true,
})

db.prepare(`INSERT INTO Friend (id, name, public_token) VALUES (?, 'Ana', ?)`).run(friendId, randomUUID())
insertTransaction({
  account_id: accountId,
  type: 'peer',
  friend_id: friendId,
  amount: -5000,
  title: 'Pizza',
  anchor_date: plusDays(3),
  next_occurrence: plusDays(3),
  requires_confirmation: true,
})

db.close()
console.log(`seeded design database at ${path}`)
