import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, type CategoryOption } from '../categories'
import {
  MIN_CONFIDENCE,
  getClassifier,
  rulesClassifier,
  setClassifier,
  suggestCategory,
  type Classification,
  type Classifier,
} from './index'

afterEach(() => {
  setClassifier(rulesClassifier)
})

function fixed(result: Classification | null | (() => never)): Classifier {
  return {
    classify: async () => {
      if (typeof result === 'function') return result()
      return result
    },
  }
}

describe('classifier registry', () => {
  it('uses the rules classifier by default', () => {
    expect(getClassifier()).toBe(rulesClassifier)
  })

  it('setClassifier replaces the active classifier', () => {
    const model = fixed(null)
    setClassifier(model)
    expect(getClassifier()).toBe(model)
  })
})

describe('suggestCategory', () => {
  it('returns the rules answer for a known merchant', async () => {
    expect(await suggestCategory('Carrefour', DEFAULT_CATEGORIES)).toEqual({ category: 'Mercado', confidence: 0.9 })
  })

  it('returns null for a blank description without calling the classifier', async () => {
    let called = false
    setClassifier({
      classify: async () => {
        called = true
        return { category: 'Lazer', confidence: 1 }
      },
    })
    expect(await suggestCategory('  ', DEFAULT_CATEGORIES)).toBeNull()
    expect(called).toBe(false)
  })

  it('returns null when there are no options', async () => {
    expect(await suggestCategory('Carrefour', [])).toBeNull()
  })

  it('drops a suggestion below the confidence threshold', async () => {
    setClassifier(fixed({ category: 'Lazer', confidence: MIN_CONFIDENCE - 0.01 }))
    expect(await suggestCategory('x', DEFAULT_CATEGORIES)).toBeNull()
  })

  it('keeps a suggestion at the threshold', async () => {
    setClassifier(fixed({ category: 'Lazer', confidence: MIN_CONFIDENCE }))
    expect(await suggestCategory('x', DEFAULT_CATEGORIES)).toEqual({ category: 'Lazer', confidence: MIN_CONFIDENCE })
  })

  it('drops a category that is not one of the options', async () => {
    setClassifier(fixed({ category: 'Inventado', confidence: 1 }))
    expect(await suggestCategory('x', DEFAULT_CATEGORIES)).toBeNull()
  })

  it('treats a failing classifier as no suggestion', async () => {
    setClassifier(
      fixed(() => {
        throw new Error('model unavailable')
      }),
    )
    expect(await suggestCategory('Carrefour', DEFAULT_CATEGORIES)).toBeNull()
  })

  it('passes the options to the classifier', async () => {
    let seen: readonly CategoryOption[] = []
    setClassifier({
      classify: async (_d, options) => {
        seen = options
        return null
      },
    })
    await suggestCategory('x', DEFAULT_CATEGORIES)
    expect(seen.map((c) => c.id)).toEqual(DEFAULT_CATEGORIES.map((c) => c.id))
  })
})
