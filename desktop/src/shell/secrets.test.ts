import { describe, expect, it } from 'vitest'
import { KONAMI, MIAU, PET_CLICKS, PET_WINDOW_MS, endsWithSequence, isEditable, pushKey, registerPet } from './secrets'

function type(keys: string[]): string[] {
  return keys.reduce<string[]>((buffer, key) => pushKey(buffer, key), [])
}

describe('secret key sequences', () => {
  it('spots the Konami code, whatever came before', () => {
    const buffer = type(['x', 'y', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A'])
    expect(endsWithSequence(buffer, KONAMI)).toBe(true)
  })

  it('spots "miau" case-insensitively and not a typo', () => {
    expect(endsWithSequence(type(['M', 'i', 'A', 'u']), MIAU)).toBe(true)
    expect(endsWithSequence(type(['m', 'i', 'a', 'o']), MIAU)).toBe(false)
  })

  it('keeps the buffer short', () => {
    expect(type(Array.from({ length: 50 }, () => 'k'))).toHaveLength(KONAMI.length)
  })

  it('ignores typing inside fields', () => {
    expect(isEditable(document.createElement('input'))).toBe(true)
    expect(isEditable(document.createElement('textarea'))).toBe(true)
    expect(isEditable(document.createElement('button'))).toBe(false)
    expect(isEditable(null)).toBe(false)
  })
})

describe('petting the logo cat', () => {
  it('purrs after enough quick clicks, then starts over', () => {
    let times: number[] = []
    let purred = false
    for (let i = 0; i < PET_CLICKS; i++) {
      const result = registerPet(times, 1000 + i * 100)
      times = result.times
      purred = result.purr
    }
    expect(purred).toBe(true)
    expect(times).toEqual([])
  })

  it('forgets slow clicks', () => {
    let times: number[] = []
    let purred = false
    for (let i = 0; i < PET_CLICKS; i++) {
      const result = registerPet(times, i * PET_WINDOW_MS)
      times = result.times
      purred ||= result.purr
    }
    expect(purred).toBe(false)
  })
})
