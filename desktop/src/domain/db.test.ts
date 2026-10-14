// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { makeDb, serialize } from './db'
import { createTestDb } from './testing/testDb'

function recordingDb(fail?: (sql: string) => boolean) {
  const calls: string[] = []
  const db = makeDb(async (sql) => {
    calls.push(sql)
    if (fail?.(sql)) throw new Error(`failed: ${sql}`)
    return []
  })
  return { db, calls }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('makeDb tx (recording runner)', () => {
  it('issues BEGIN IMMEDIATE, the queries, then COMMIT, in order', async () => {
    const { db, calls } = recordingDb()
    await db.tx(async () => {
      await db.query('INSERT INTO a VALUES (?)', [1])
      await db.query('UPDATE a SET x = 2')
    })
    expect(calls).toEqual(['BEGIN IMMEDIATE', 'INSERT INTO a VALUES (?)', 'UPDATE a SET x = 2', 'COMMIT'])
  })

  it('rolls back and rethrows the original error when fn throws', async () => {
    const { db, calls } = recordingDb()
    await expect(
      db.tx(async () => {
        await db.query('INSERT INTO a VALUES (1)')
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(calls).toEqual(['BEGIN IMMEDIATE', 'INSERT INTO a VALUES (1)', 'ROLLBACK'])
  })

  it('a failing ROLLBACK does not hide the original error', async () => {
    const { db } = recordingDb((sql) => sql === 'ROLLBACK')
    await expect(
      db.tx(async () => {
        throw new Error('original')
      }),
    ).rejects.toThrow('original')
  })

  it('rejects nested transactions and stays usable afterwards', async () => {
    const { db, calls } = recordingDb()
    await expect(
      db.tx(async () => {
        await db.tx(async () => 1)
      }),
    ).rejects.toThrow('nested transactions are not supported')
    await db.tx(async () => 'ok')
    expect(calls.slice(-2)).toEqual(['BEGIN IMMEDIATE', 'COMMIT'])
  })
})

describe('makeDb tx (real test database)', () => {
  it('write then read inside tx sees the write; rollback removes it; commit keeps it', async () => {
    const db = await createTestDb({ migrate: false })
    await db.query('CREATE TABLE scratch (id INTEGER PRIMARY KEY, amount INTEGER)')
    const count = async () => (await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM scratch'))[0].n

    const seen = await db.tx(async () => {
      await db.query('INSERT INTO scratch (amount) VALUES (?)', [500])
      return (await db.query<{ total: number }>('SELECT SUM(amount) AS total FROM scratch'))[0].total
    })
    expect(seen).toBe(500)

    await expect(
      db.tx(async () => {
        await db.query('INSERT INTO scratch (amount) VALUES (?)', [700])
        throw new Error('fail after write')
      }),
    ).rejects.toThrow('fail after write')
    expect(await count()).toBe(1)

    await db.tx(async () => {
      await db.query('INSERT INTO scratch (amount) VALUES (?)', [900])
    })
    expect(await count()).toBe(2)
    db.close()
  })

  it('accepts booleans and undefined as parameters', async () => {
    const db = await createTestDb({ migrate: false })
    const rows = await db.query<{ a: number; b: number | null }>('SELECT ? AS a, ? AS b', [true, undefined])
    expect(rows).toEqual([{ a: 1, b: null }])
    db.close()
  })
})

describe('serialize', () => {
  it('runs functions strictly in call order even when the first is slower', async () => {
    const order: string[] = []
    const first = serialize(async () => {
      await delay(30)
      order.push('first')
      return 1
    })
    const second = serialize(async () => {
      order.push('second')
      return 2
    })
    const third = serialize(async () => {
      order.push('third')
      return 3
    })
    await expect(Promise.all([first, second, third])).resolves.toEqual([1, 2, 3])
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('a rejection reaches only its caller and later calls still run', async () => {
    const failing = serialize(async () => {
      throw new Error('one failed')
    })
    const following = serialize(async () => 'next')
    await expect(failing).rejects.toThrow('one failed')
    await expect(following).resolves.toBe('next')
  })
})
