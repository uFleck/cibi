import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CATEGORIES } from '../categories'
import { composeClassifiers } from './compose'
import { LAYA_MIN_CONFIDENCE, createLayaClassifier, type LayaAgent } from './laya'
import { rulesClassifier, setClassifier, suggestCategory, type Classification, type Classifier } from './index'

afterEach(() => {
  setClassifier(rulesClassifier)
})

function agentAnswering(answer: Record<string, unknown> | null) {
  const predict = vi.fn(async () => ({ answers: answer === null ? {} : { category: answer } }))
  return { predict } satisfies LayaAgent & { predict: typeof predict }
}

function choice(label: string, confidence: number) {
  return { type: 'choice', choice: label, answer_confidence: confidence, probabilities: {} }
}

/** A promise that never settles, standing in for a model load or a prediction that stalls. */
function stalled<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

describe('createLayaClassifier', () => {
  it('maps the chosen label to its category and uses the model confidence', async () => {
    const agent = agentAnswering(choice('Mercado', 0.93))
    const classifier = createLayaClassifier(async () => agent)
    const result = await classifier.classify('Mercado Livre', DEFAULT_CATEGORIES)
    expect(result).toEqual({ category: 'Mercado', confidence: 0.93, minConfidence: LAYA_MIN_CONFIDENCE })
  })

  it('offers every category as a criterion keyed by its label, with its description when it has one', async () => {
    const agent = agentAnswering(choice('Lazer', 0.9))
    const result = await createLayaClassifier(async () => agent).classify('Cinemark', [
      DEFAULT_CATEGORIES[0],
      { id: 'custom:Lazer', label: 'Lazer', description: '' },
      { id: 'custom:Pet', label: 'Pet', description: '' },
    ])
    expect(result?.category).toBe('Lazer')
    const [state, questions] = agent.predict.mock.calls[0] as unknown as [unknown, Record<string, { criteria: Record<string, string> }>]
    expect(state).toBe('Pagamento: Cinemark')
    expect(questions.category.criteria).toEqual({
      Mercado: DEFAULT_CATEGORIES[0].description,
      Lazer: 'Lazer',
      Pet: 'Pet',
    })
  })

  it('loads the model once, on the first classification', async () => {
    const load = vi.fn(async () => agentAnswering(choice('Lazer', 0.9)))
    const classifier = createLayaClassifier(load)
    expect(load).not.toHaveBeenCalled()
    await classifier.classify('Cinemark', DEFAULT_CATEGORIES)
    await classifier.classify('Teatro', DEFAULT_CATEGORIES)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('returns null for a blank description or no categories without loading the model', async () => {
    const load = vi.fn(async () => agentAnswering(choice('Lazer', 0.9)))
    const classifier = createLayaClassifier(load)
    expect(await classifier.classify('   ', DEFAULT_CATEGORIES)).toBeNull()
    expect(await classifier.classify('Cinemark', [])).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('returns null when the model cannot load, and keeps returning null', async () => {
    const load = vi.fn(async () => {
      throw new Error('model missing')
    })
    const classifier = createLayaClassifier(load)
    expect(await classifier.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
    expect(await classifier.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('returns null when prediction throws', async () => {
    const agent = { predict: vi.fn(async () => { throw new Error('boom') }) }
    expect(await createLayaClassifier(async () => agent).classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
  })

  it('returns null for an answer that is not a choice over the given labels', async () => {
    const unknownLabel = createLayaClassifier(async () => agentAnswering(choice('Nope', 0.99)))
    expect(await unknownLabel.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
    const noAnswer = createLayaClassifier(async () => agentAnswering(null))
    expect(await noAnswer.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
    const wrongType = createLayaClassifier(async () => agentAnswering({ type: 'score', score: 4 }))
    expect(await wrongType.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
  })

  it('uses the ML threshold for its answers, not the rules threshold', async () => {
    const classifier = createLayaClassifier(async () => agentAnswering(choice('Transporte', 0.6)), { minConfidence: 0.5 })
    const result = await classifier.classify('Posto Ipiranga', DEFAULT_CATEGORIES)
    expect(result).toEqual({ category: 'Transporte', confidence: 0.6, minConfidence: 0.5 })
    setClassifier(classifier)
    expect(await suggestCategory('Posto Ipiranga', DEFAULT_CATEGORIES)).toEqual(result)
  })

  describe('without waiting for the model', () => {
    it('a stalled load does not hang classify: it gives up after the load timeout', async () => {
      const classifier = createLayaClassifier(() => stalled(), { loadTimeoutMs: 20 })
      const started = Date.now()
      expect(await classifier.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
      expect(Date.now() - started).toBeLessThan(2000)
    })

    it('a stalled prediction does not hang classify: it gives up after the predict timeout', async () => {
      const agent = { predict: vi.fn(() => stalled<{ answers: Record<string, unknown> }>()) }
      const classifier = createLayaClassifier(async () => agent, { predictTimeoutMs: 20 })
      expect(await classifier.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
    })

    it('onlyIfReady answers nothing and does not wait while the model is not loaded', async () => {
      const load = vi.fn(() => stalled<LayaAgent>())
      const classifier = createLayaClassifier(load, { loadTimeoutMs: 60_000 })
      const started = Date.now()
      expect(await classifier.classify('Uber', DEFAULT_CATEGORIES, { onlyIfReady: true })).toBeNull()
      expect(Date.now() - started).toBeLessThan(1000)
      expect(load).not.toHaveBeenCalled()
    })

    it('warm starts the load in the background, and onlyIfReady answers once it is done', async () => {
      const agent = agentAnswering(choice('Transporte', 0.95))
      const load = vi.fn(async () => agent)
      const classifier = createLayaClassifier(load)
      classifier.warm?.()
      classifier.warm?.()
      expect(load).toHaveBeenCalledTimes(1)
      await vi.waitFor(async () => {
        expect(await classifier.classify('Uber', DEFAULT_CATEGORIES, { onlyIfReady: true })).not.toBeNull()
      })
    })

    it('a load that outlives the timeout still becomes ready for later calls', async () => {
      let finish: (agent: LayaAgent) => void = () => {}
      const agent = agentAnswering(choice('Transporte', 0.95))
      const classifier = createLayaClassifier(() => new Promise<LayaAgent>((resolve) => { finish = resolve }), {
        loadTimeoutMs: 10,
      })
      expect(await classifier.classify('Uber', DEFAULT_CATEGORIES)).toBeNull()
      finish(agent)
      await vi.waitFor(async () => {
        expect(await classifier.classify('Uber', DEFAULT_CATEGORIES, { onlyIfReady: true })).not.toBeNull()
      })
    })
  })
})

describe('composeClassifiers', () => {
  const answer = (category: string): Classifier => ({ classify: async () => ({ category, confidence: 0.9 }) })
  const none: Classifier = { classify: async () => null }
  const broken: Classifier = { classify: async () => { throw new Error('down') } }

  it('returns the first answer, so later classifiers are not asked', async () => {
    const later = vi.fn(async (): Promise<Classification> => ({ category: 'Outros', confidence: 0.9 }))
    const composed = composeClassifiers(answer('Mercado'), { classify: later })
    expect(await composed.classify('Carrefour', DEFAULT_CATEGORIES)).toEqual({ category: 'Mercado', confidence: 0.9 })
    expect(later).not.toHaveBeenCalled()
  })

  it('falls through a null or a throwing classifier to the next one', async () => {
    const composed = composeClassifiers(none, broken, answer('Viagem'))
    expect(await composed.classify('Hotel', DEFAULT_CATEGORIES)).toEqual({ category: 'Viagem', confidence: 0.9 })
  })

  it('returns null when every classifier returns null', async () => {
    expect(await composeClassifiers(none, broken).classify('?', DEFAULT_CATEGORIES)).toBeNull()
  })

  it('passes the options through and warms every classifier', async () => {
    const seen = vi.fn(async (): Promise<Classification | null> => null)
    const warm = vi.fn()
    const composed = composeClassifiers({ classify: seen, warm }, { classify: async () => null })
    await composed.classify('Uber', DEFAULT_CATEGORIES, { onlyIfReady: true })
    expect(seen).toHaveBeenCalledWith('Uber', DEFAULT_CATEGORIES, { onlyIfReady: true })
    composed.warm?.()
    expect(warm).toHaveBeenCalledTimes(1)
  })
})

describe('suggestCategory with per-answer thresholds', () => {
  const offer = (result: Classification) => {
    const classifier: Classifier = { classify: async () => result }
    setClassifier(classifier)
    return suggestCategory('x', DEFAULT_CATEGORIES)
  }

  it('offers an answer at its own minimum confidence even below the rules threshold', async () => {
    const result = await offer({ category: 'Lazer', confidence: 0.6, minConfidence: 0.5 })
    expect(result).toEqual({ category: 'Lazer', confidence: 0.6, minConfidence: 0.5 })
  })

  it('drops an answer below its own minimum confidence', async () => {
    expect(await offer({ category: 'Lazer', confidence: 0.4, minConfidence: 0.5 })).toBeNull()
  })

  it('applies MIN_CONFIDENCE to answers without their own minimum', async () => {
    expect(await offer({ category: 'Lazer', confidence: 0.7 })).toBeNull()
  })
})
