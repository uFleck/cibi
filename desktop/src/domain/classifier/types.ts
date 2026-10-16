import type { CategoryOption } from '../categories'

export interface Classification {
  /** The label of one of the options passed to classify. */
  category: string
  /** 0 to 1. */
  confidence: number
  /** The least confidence this answer may be offered with. Defaults to MIN_CONFIDENCE. */
  minConfidence?: number
}

export interface ClassifyOptions {
  /** Answer only if the classifier is already loaded. Never waits for a model. */
  onlyIfReady?: boolean
}

/** Picks a category for a transaction description. Returns null when nothing matches confidently. */
export interface Classifier {
  classify(
    description: string,
    categories: readonly CategoryOption[],
    options?: ClassifyOptions,
  ): Promise<Classification | null>
  /** Starts loading any model in the background. Fire and forget; a no-op for rules. */
  warm?(): void
}
