// Port of internal/repo/sqlite/group_event.go.
//
// Ids: see repo/accounts.ts. Money is integer cents. A group event's date is stored text (RFC3339 or
// YYYY-MM-DD) that Insert and Update write as given; the reads that need a calendar date parse it with
// parseRfc3339OrYmd. A transaction's created_at is written as RFC3339 (formatDbTime) and read back
// with the strict RFC3339 parser, as Go does.
//
// Column aliases: SQL expressions get an explicit alias (AS ...) so the row key is a plain name.
// The SQL is otherwise Go's.

import type { Db, SqlParam } from '../db'
import { AppError, ErrNoRows, wrap } from '../errors'
import { formatDbTime, parseRfc3339, parseRfc3339OrYmd } from '../dates'
import { parseUuid } from '../uuid'
import { execRowsAffected } from './exec'
import { boolCol, intCol, nullableTextCol, type Row, textCol } from './scan'

/** Mirrors the GroupEvent schema row: a shared expense (e.g. a pizza night). */
export interface GroupEvent {
  id: string
  accountId: string
  title: string
  /** Stored text, RFC3339 or YYYY-MM-DD, written as given. */
  date: string
  /** Cents. */
  totalAmount: number
  publicToken: string
  notes: string | null
  hostFriendId: string | null
}

/** A participant's share in a group event. friendId null = the app owner (admin) row. */
export interface GroupEventParticipant {
  eventId: string
  friendId: string | null
  /** Cents. */
  shareAmount: number
  isConfirmed: boolean
}

/** Pending balances derived from group events, from the admin's side (cents). */
export interface GroupEventBalance {
  /** Unconfirmed friend shares where the admin is the host. */
  theyOweAdmin: number
  /** Unconfirmed admin shares where a friend is the host. */
  adminOwesHost: number
}

/** One pending admin payment in an event hosted by a friend. */
export interface AdminGroupExpense {
  hostName: string
  /** Cents. */
  shareAmount: number
  /** Stored text (RFC3339 or YYYY-MM-DD). */
  date: string
}

/** A transaction record within a group event. */
export interface GroupEventTransaction {
  id: string
  eventId: string
  description: string
  /** Cents. */
  amount: number
  /** UTC; written with whole seconds. */
  createdAt: Date
}

export interface GroupEventRepo {
  insert(e: GroupEvent): Promise<void>
  /** accountId null = every account. Go nil slice for no rows is an empty array here. */
  getAll(accountId: string | null): Promise<GroupEvent[]>
  /** Rejects with an error wrapping ErrNoRows when the id is unknown. */
  getById(id: string): Promise<GroupEvent>
  /** Rejects with an error wrapping ErrNoRows when the token is unknown. */
  getByToken(token: string): Promise<GroupEvent>
  /** Events the friend joined or hosts, newest date first. */
  getByFriend(friendId: string): Promise<GroupEvent[]>
  /** Each given field is written; undefined = no change. Rejects when no field is given or the row is missing. */
  update(id: string, title?: string, date?: string, totalAmount?: number, notes?: string): Promise<void>
  deleteById(id: string): Promise<void>
  /** Replaces the participants of an event, in one transaction. */
  setParticipants(eventId: string, participants: GroupEventParticipant[], hostFriendId: string | null): Promise<void>
  setParticipantConfirmed(eventId: string, friendId: string, isConfirmed: boolean): Promise<void>
  toggleParticipantConfirmed(eventId: string, friendId: string): Promise<void>
  getParticipants(eventId: string): Promise<GroupEventParticipant[]>
  sumUpcomingAdminObligations(accountId: string | null, after: Date, onOrBefore: Date): Promise<number>
  /** Every unconfirmed admin share in an event a friend hosts, oldest date first. Never null (empty array). */
  getAdminPendingExpenses(accountId: string | null): Promise<AdminGroupExpense[]>
  getPendingBalanceForAdmin(accountId: string | null): Promise<GroupEventBalance>
  insertTransaction(t: GroupEventTransaction): Promise<void>
  deleteTransactionById(id: string): Promise<void>
  /** Newest first. */
  getTransactionsByEvent(eventId: string): Promise<GroupEventTransaction[]>
}

function bit(v: boolean): number {
  return v ? 1 : 0
}

/** Columns of a GroupEvent row; host_friend_id NULL is no host, any other text must be a UUID. */
function scanGroupEvent(row: Row): GroupEvent {
  const hostFriendId = nullableTextCol(row, 'host_friend_id')
  return {
    id: parseUuid(textCol(row, 'id')),
    accountId: parseUuid(textCol(row, 'account_id')),
    title: textCol(row, 'title'),
    date: textCol(row, 'date'),
    totalAmount: intCol(row, 'total_amount'),
    publicToken: textCol(row, 'public_token'),
    notes: nullableTextCol(row, 'notes'),
    hostFriendId: hostFriendId === null ? null : parseUuid(hostFriendId),
  }
}

function scanParticipant(row: Row): GroupEventParticipant {
  const friendId = nullableTextCol(row, 'friend_id')
  return {
    eventId: parseUuid(textCol(row, 'event_id')),
    friendId: friendId === null ? null : parseUuid(friendId),
    shareAmount: intCol(row, 'share_amount'),
    isConfirmed: boolCol(row, 'is_confirmed'),
  }
}

const SELECT_EVENT = `SELECT id, account_id, title, date, total_amount, public_token, notes, host_friend_id FROM GroupEvent`

export class SqliteGroupEventRepo implements GroupEventRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(e: GroupEvent): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO GroupEvent (id, account_id, title, date, total_amount, public_token, notes, host_friend_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.accountId, e.title, e.date, e.totalAmount, e.publicToken, e.notes, e.hostFriendId],
      )
    } catch (err) {
      throw wrap('group_event.Insert', err)
    }
  }

  async getAll(accountId: string | null): Promise<GroupEvent[]> {
    let query = SELECT_EVENT
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` WHERE account_id = ?`
      args.push(accountId)
    }
    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap('group_event.GetAll: query', err)
    }
    try {
      return rows.map(scanGroupEvent)
    } catch (err) {
      throw wrap('group_event.GetAll: scan', err)
    }
  }

  async getById(id: string): Promise<GroupEvent> {
    return this.getOne(`${SELECT_EVENT} WHERE id = ?`, id, 'group_event.GetByID')
  }

  async getByToken(token: string): Promise<GroupEvent> {
    return this.getOne(`${SELECT_EVENT} WHERE public_token = ?`, token, 'group_event.GetByToken')
  }

  /** QueryRow semantics: the first row, or ErrNoRows when there is none. */
  private async getOne(sql: string, param: string, op: string): Promise<GroupEvent> {
    let rows: Row[]
    try {
      rows = await this.db.query(sql, [param])
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap(op, ErrNoRows)
    try {
      return scanGroupEvent(row)
    } catch (err) {
      throw wrap(op, err)
    }
  }

  async getByFriend(friendId: string): Promise<GroupEvent[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT DISTINCT ge.id, ge.account_id, ge.title, ge.date, ge.total_amount, ge.public_token, ge.notes, ge.host_friend_id
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id
		 WHERE gep.friend_id = ? OR ge.host_friend_id = ?
		 ORDER BY ge.date DESC`,
        [friendId, friendId],
      )
    } catch (err) {
      throw wrap('group_event.GetByFriend: query', err)
    }
    try {
      return rows.map(scanGroupEvent)
    } catch (err) {
      throw wrap('group_event.GetByFriend: scan', err)
    }
  }

  async update(id: string, title?: string, date?: string, totalAmount?: number, notes?: string): Promise<void> {
    const setClauses: string[] = []
    const args: SqlParam[] = []
    if (title !== undefined) {
      setClauses.push('title = ?')
      args.push(title)
    }
    if (date !== undefined) {
      setClauses.push('date = ?')
      args.push(date)
    }
    if (totalAmount !== undefined) {
      setClauses.push('total_amount = ?')
      args.push(totalAmount)
    }
    if (notes !== undefined) {
      setClauses.push('notes = ?')
      args.push(notes)
    }
    if (setClauses.length === 0) {
      throw new AppError('group_event.Update: no fields provided')
    }

    let changed: number
    try {
      changed = await execRowsAffected(
        this.db,
        `UPDATE GroupEvent SET ${setClauses.join(', ')} WHERE id = ?`,
        [...args, id],
      )
    } catch (err) {
      throw wrap('group_event.Update', err)
    }
    if (changed === 0) throw wrap('group_event.Update', ErrNoRows)
  }

  async deleteById(id: string): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(this.db, `DELETE FROM GroupEvent WHERE id = ?`, [id])
    } catch (err) {
      throw wrap('group_event.DeleteByID', err)
    }
    if (changed === 0) throw wrap('group_event.DeleteByID', ErrNoRows)
  }

  /**
   * Replaces the participants in one transaction. The event must exist; the host (when given) must be
   * a participant; the owner (admin, friendId null) must be a participant.
   */
  async setParticipants(eventId: string, participants: GroupEventParticipant[], hostFriendId: string | null): Promise<void> {
    const op = 'group_event.SetParticipants'
    await this.db.tx(async () => {
      // Verify the event exists before modifying participants. Any failure reads as "no rows", as Go does.
      let exists: Row[]
      try {
        exists = await this.db.query(`SELECT 1 FROM GroupEvent WHERE id = ?`, [eventId])
      } catch {
        throw wrap(op, ErrNoRows)
      }
      if (exists.length === 0) throw wrap(op, ErrNoRows)

      let ownerIncluded = false
      if (hostFriendId !== null) {
        let hostIncluded = false
        for (const p of participants) {
          if (p.friendId === null) ownerIncluded = true
          if (p.friendId !== null && p.friendId === hostFriendId) hostIncluded = true
        }
        if (!hostIncluded) throw new AppError(`${op}: host friend must be a participant`)
      } else {
        for (const p of participants) {
          if (p.friendId === null) {
            ownerIncluded = true
            break
          }
        }
      }
      if (!ownerIncluded) throw new AppError(`${op}: owner/admin must always be a participant`)

      try {
        await this.db.query(`UPDATE GroupEvent SET host_friend_id = ? WHERE id = ?`, [hostFriendId, eventId])
      } catch (err) {
        throw wrap(`${op}: update host`, err)
      }

      try {
        await this.db.query(`DELETE FROM GroupEventParticipant WHERE event_id = ?`, [eventId])
      } catch (err) {
        throw wrap(`${op}: delete`, err)
      }

      for (const p of participants) {
        try {
          await this.db.query(
            `INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed) VALUES (?, ?, ?, ?)`,
            [eventId, p.friendId, p.shareAmount, bit(p.isConfirmed)],
          )
        } catch (err) {
          throw wrap(`${op}: insert`, err)
        }
      }
    })
  }

  async setParticipantConfirmed(eventId: string, friendId: string, isConfirmed: boolean): Promise<void> {
    const op = 'group_event.SetParticipantConfirmed'
    let changed: number
    try {
      changed = await execRowsAffected(
        this.db,
        `UPDATE GroupEventParticipant SET is_confirmed = ? WHERE event_id = ? AND friend_id = ?`,
        [bit(isConfirmed), eventId, friendId],
      )
    } catch (err) {
      throw wrap(op, err)
    }
    if (changed === 0) throw wrap(op, ErrNoRows)
  }

  async toggleParticipantConfirmed(eventId: string, friendId: string): Promise<void> {
    const op = 'group_event.ToggleParticipantConfirmed'
    let changed: number
    try {
      changed = await execRowsAffected(
        this.db,
        `UPDATE GroupEventParticipant
		 SET is_confirmed = CASE WHEN is_confirmed = 1 THEN 0 ELSE 1 END
		 WHERE event_id = ? AND friend_id = ?`,
        [eventId, friendId],
      )
    } catch (err) {
      throw wrap(op, err)
    }
    if (changed === 0) throw wrap(op, ErrNoRows)
  }

  async getParticipants(eventId: string): Promise<GroupEventParticipant[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT event_id, friend_id, share_amount, is_confirmed FROM GroupEventParticipant WHERE event_id = ?`,
        [eventId],
      )
    } catch (err) {
      throw wrap('group_event.GetParticipants: query', err)
    }
    try {
      return rows.map(scanParticipant)
    } catch (err) {
      throw wrap('group_event.GetParticipants: scan', err)
    }
  }

  /**
   * Pending admin-to-host obligations in [after, onOrBefore), as a negative or zero amount so it adds
   * straight into the purchasing power math. A date that does not parse is skipped.
   */
  async sumUpcomingAdminObligations(accountId: string | null, after: Date, onOrBefore: Date): Promise<number> {
    const op = 'group_event.SumUpcomingAdminObligations'
    let query = `SELECT ge.date, gep.share_amount
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id
		 WHERE ge.host_friend_id IS NOT NULL
		   AND gep.friend_id IS NULL
		   AND gep.is_confirmed = 0`
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` AND ge.account_id = ?`
      args.push(accountId)
    }

    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap(`${op}: query`, err)
    }
    let sum = 0
    try {
      for (const row of rows) {
        const dateStr = textCol(row, 'date')
        const share = intCol(row, 'share_amount')
        let due: Date
        try {
          due = parseRfc3339OrYmd(dateStr)
        } catch {
          continue
        }
        if (due.getTime() > after.getTime() && due.getTime() < onOrBefore.getTime()) {
          sum -= share
        }
      }
    } catch (err) {
      throw wrap(`${op}: scan`, err)
    }
    return sum
  }

  async getAdminPendingExpenses(accountId: string | null): Promise<AdminGroupExpense[]> {
    const op = 'group_event.GetAdminPendingExpenses'
    let query = `SELECT f.name, gep.share_amount, ge.date
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id
		 JOIN Friend f ON f.id = ge.host_friend_id
		 WHERE ge.host_friend_id IS NOT NULL
		   AND gep.friend_id IS NULL
		   AND gep.is_confirmed = 0`
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` AND ge.account_id = ?`
      args.push(accountId)
    }
    query += ` ORDER BY ge.date`

    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap(`${op}: query`, err)
    }
    try {
      return rows.map((row) => ({
        hostName: textCol(row, 'name'),
        shareAmount: intCol(row, 'share_amount'),
        date: textCol(row, 'date'),
      }))
    } catch (err) {
      throw wrap(`${op}: scan`, err)
    }
  }

  async insertTransaction(t: GroupEventTransaction): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO GroupEventTransaction (id, event_id, description, amount, created_at) VALUES (?, ?, ?, ?, ?)`,
        [t.id, t.eventId, t.description, t.amount, formatDbTime(t.createdAt)],
      )
    } catch (err) {
      throw wrap('group_event.InsertTransaction', err)
    }
  }

  async deleteTransactionById(id: string): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(this.db, `DELETE FROM GroupEventTransaction WHERE id = ?`, [id])
    } catch (err) {
      throw wrap('group_event.DeleteTransactionByID', err)
    }
    if (changed === 0) throw wrap('group_event.DeleteTransactionByID', ErrNoRows)
  }

  async getTransactionsByEvent(eventId: string): Promise<GroupEventTransaction[]> {
    const op = 'group_event.GetTransactionsByEvent'
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT id, event_id, description, amount, created_at FROM GroupEventTransaction WHERE event_id = ? ORDER BY created_at DESC`,
        [eventId],
      )
    } catch (err) {
      throw wrap(`${op}: query`, err)
    }
    const out: GroupEventTransaction[] = []
    for (const row of rows) {
      let id: string
      let eventIdOut: string
      try {
        id = parseUuid(textCol(row, 'id'))
      } catch (err) {
        throw wrap(`${op}: parse id uuid`, err)
      }
      try {
        eventIdOut = parseUuid(textCol(row, 'event_id'))
      } catch (err) {
        throw wrap(`${op}: parse event_id uuid`, err)
      }
      let createdAt: Date
      try {
        createdAt = parseRfc3339(textCol(row, 'created_at'))
      } catch (err) {
        throw wrap(`${op}: parse created_at`, err)
      }
      out.push({
        id,
        eventId: eventIdOut,
        description: textCol(row, 'description'),
        amount: intCol(row, 'amount'),
        createdAt,
      })
    }
    return out
  }

  async getPendingBalanceForAdmin(accountId: string | null): Promise<GroupEventBalance> {
    const op = 'group_event.GetPendingBalanceForAdmin'
    let query = `SELECT
		    COALESCE(SUM(CASE
		      WHEN ge.host_friend_id IS NULL AND gep.friend_id IS NOT NULL AND gep.is_confirmed = 0
		      THEN gep.share_amount ELSE 0 END), 0) AS they_owe_admin,
		    COALESCE(SUM(CASE
		      WHEN ge.host_friend_id IS NOT NULL AND gep.friend_id IS NULL AND gep.is_confirmed = 0
		      THEN gep.share_amount ELSE 0 END), 0) AS admin_owes_host
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id`
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` WHERE ge.account_id = ?`
      args.push(accountId)
    }

    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap(op, ErrNoRows)
    try {
      return {
        theyOweAdmin: intCol(row, 'they_owe_admin'),
        adminOwesHost: intCol(row, 'admin_owes_host'),
      }
    } catch (err) {
      throw wrap(op, err)
    }
  }
}
