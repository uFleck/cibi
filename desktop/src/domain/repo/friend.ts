// Port of internal/repo/sqlite/friend.go.
//
// Ids: see repo/accounts.ts. Notes and pix_key are nullable text (null = NULL). Go's nil pointer
// arguments of Update are `undefined` here (no change); an empty string is written as ''.

import type { Db } from '../db'
import { AppError, ErrNoRows, wrap } from '../errors'
import { parseUuid } from '../uuid'
import { execRowsAffected } from './exec'
import { type Row, nullableTextCol, textCol } from './scan'

/** Mirrors the Friend schema row. */
export interface Friend {
  id: string
  name: string
  publicToken: string
  notes: string | null
  pixKey: string | null
}

/** deleteById rejects with an error wrapping this when the friend still has peer debts or group events. */
export const ErrFriendInUse = new AppError(
  'friend still has peer debts or group events; remove them before deleting the friend',
)

export interface FriendRepo {
  insert(f: Friend): Promise<void>
  /** Go nil slice for no rows is an empty array here. */
  getAll(): Promise<Friend[]>
  /** Rejects with an error wrapping ErrNoRows when the id is unknown. */
  getById(id: string): Promise<Friend>
  /** Rejects with an error wrapping ErrNoRows when the token is unknown. */
  getByToken(token: string): Promise<Friend>
  update(id: string, name?: string, notes?: string, pixKey?: string): Promise<void>
  deleteById(id: string): Promise<void>
}

const SELECT_FRIEND = `SELECT id, name, public_token, notes, pix_key FROM Friend`

function scanFriend(row: Row, op: string): Friend {
  let id: string
  try {
    id = parseUuid(textCol(row, 'id'))
  } catch (err) {
    throw wrap(`${op}: parse uuid`, err)
  }
  return {
    id,
    name: textCol(row, 'name'),
    publicToken: textCol(row, 'public_token'),
    notes: nullableTextCol(row, 'notes'),
    pixKey: nullableTextCol(row, 'pix_key'),
  }
}

export class SqliteFriendRepo implements FriendRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(f: Friend): Promise<void> {
    try {
      await this.db.query(`INSERT INTO Friend (id, name, public_token, notes, pix_key) VALUES (?, ?, ?, ?, ?)`, [
        f.id,
        f.name,
        f.publicToken,
        f.notes,
        f.pixKey,
      ])
    } catch (err) {
      throw wrap('friend.Insert', err)
    }
  }

  async getAll(): Promise<Friend[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(SELECT_FRIEND)
    } catch (err) {
      throw wrap('friend.GetAll: query', err)
    }
    try {
      return rows.map((row) => scanFriend(row, 'friend.GetAll'))
    } catch (err) {
      throw wrap('friend.GetAll: scan', err)
    }
  }

  async getById(id: string): Promise<Friend> {
    return this.getOne(`${SELECT_FRIEND} WHERE id = ?`, id, 'friend.GetByID')
  }

  async getByToken(token: string): Promise<Friend> {
    return this.getOne(`${SELECT_FRIEND} WHERE public_token = ?`, token, 'friend.GetByToken')
  }

  /** QueryRow semantics: the first row, or ErrNoRows when there is none. */
  private async getOne(sql: string, param: string, op: string): Promise<Friend> {
    let rows: Row[]
    try {
      rows = await this.db.query(sql, [param])
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap(op, ErrNoRows)
    try {
      return scanFriend(row, op)
    } catch (err) {
      throw wrap(op, err)
    }
  }

  /**
   * Patches the given fields in one transaction, in Go's order. A missing id is an error only
   * when the name is set (the Go code checks RowsAffected for the name update alone).
   */
  async update(id: string, name?: string, notes?: string, pixKey?: string): Promise<void> {
    await this.db.tx(async () => {
      if (name !== undefined) {
        let changed: number
        try {
          changed = await execRowsAffected(this.db, `UPDATE Friend SET name = ? WHERE id = ?`, [name, id])
        } catch (err) {
          throw wrap('friend.Update: name', err)
        }
        if (changed === 0) throw wrap('friend.Update', ErrNoRows)
      }
      if (notes !== undefined) {
        try {
          await this.db.query(`UPDATE Friend SET notes = ? WHERE id = ?`, [notes, id])
        } catch (err) {
          throw wrap('friend.Update: notes', err)
        }
      }
      if (pixKey !== undefined) {
        try {
          await this.db.query(`UPDATE Friend SET pix_key = ? WHERE id = ?`, [pixKey, id])
        } catch (err) {
          throw wrap('friend.Update: pix_key', err)
        }
      }
    })
  }

  /**
   * Deletes the friend. The schema does not cascade from Friend (Transaction.friend_id for peer
   * debts, GroupEventParticipant.friend_id, GroupEvent.host_friend_id), so a friend that is still
   * referenced fails on the foreign key; that is reported as ErrFriendInUse and nothing is deleted.
   */
  async deleteById(id: string): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(this.db, `DELETE FROM Friend WHERE id = ?`, [id])
    } catch (err) {
      if (/FOREIGN KEY constraint failed/.test(err instanceof Error ? err.message : String(err))) {
        throw wrap('friend.DeleteByID', ErrFriendInUse)
      }
      throw wrap('friend.DeleteByID', err)
    }
    if (changed === 0) throw wrap('friend.DeleteByID', ErrNoRows)
  }
}
