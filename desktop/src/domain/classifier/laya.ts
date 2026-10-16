// Laya (https://github.com/NandhaKishorM/laya, Apache-2.0) as a classifier: one choice question over
// the category options, answered in one forward pass. The model loads in the background, never on
// the save path.

import type { CategoryOption } from '../categories'
import type { Classifier, ClassifyOptions } from './types'

/** The part of the laya Agent the classifier uses. Agent.predict satisfies it. */
export interface LayaAgent {
  predict(state: unknown, questions: Record<string, LayaChoiceQuestion>): Promise<{ answers: Record<string, unknown> }>
}

export type LayaChoiceQuestion = {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

/**
 * Laya's own threshold on its top probability. On the 47-description evaluation (docs/laya.md) it is
 * the lowest value at which Laya's answers are at least 90% correct.
 */
export const LAYA_MIN_CONFIDENCE = 0.8
export const LAYA_LOAD_TIMEOUT_MS = 60_000
export const LAYA_PREDICT_TIMEOUT_MS = 3_000

export interface LayaOptions {
  minConfidence?: number
  loadTimeoutMs?: number
  predictTimeoutMs?: number
}

const QUESTION = 'category'
const INSTRUCTIONS = 'Which spending category fits this payment?'

/**
 * A classifier backed by a Laya agent. `load` runs at most once and keeps running after a caller
 * stops waiting for it. A failed load, a stalled load or a stalled prediction gives no answer, so
 * a missing or broken model never blocks saving a transaction.
 */
export function createLayaClassifier(load: () => Promise<LayaAgent>, options: LayaOptions = {}): Classifier {
  const minConfidence = options.minConfidence ?? LAYA_MIN_CONFIDENCE
  const loadTimeoutMs = options.loadTimeoutMs ?? LAYA_LOAD_TIMEOUT_MS
  const predictTimeoutMs = options.predictTimeoutMs ?? LAYA_PREDICT_TIMEOUT_MS
  let agent: Promise<LayaAgent> | null = null
  let model: LayaAgent | null = null

  const start = (): Promise<LayaAgent> => {
    if (agent === null) {
      agent = load()
      agent.then(
        (loaded) => {
          model = loaded
        },
        () => {},
      )
    }
    return agent
  }

  return {
    warm() {
      start().catch(() => {})
    },
    async classify(description: string, categories: readonly CategoryOption[], classifyOptions?: ClassifyOptions) {
      const text = description.trim()
      if (text === '' || categories.length === 0) return null
      if (classifyOptions?.onlyIfReady && model === null) return null
      try {
        const loaded = model ?? (await withTimeout(start(), loadTimeoutMs))
        const criteria = Object.fromEntries(categories.map((c) => [c.label, c.description || c.label]))
        const result = await withTimeout(
          loaded.predict(`Pagamento: ${text}`, { [QUESTION]: { type: 'choice', instructions: INSTRUCTIONS, criteria } }),
          predictTimeoutMs,
        )
        const answer = result.answers[QUESTION] as { type?: unknown; choice?: unknown; answer_confidence?: unknown } | undefined
        if (answer?.type !== 'choice' || typeof answer.choice !== 'string' || typeof answer.answer_confidence !== 'number') {
          return null
        }
        const option = categories.find((c) => c.label === answer.choice)
        if (!option) return null
        return { category: option.label, confidence: answer.answer_confidence, minConfidence }
      } catch {
        return null
      }
    },
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`laya: no answer within ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
