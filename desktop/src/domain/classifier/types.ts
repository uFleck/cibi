import type { CategoryOption } from '../categories'

export interface Classification {
  /** The label of one of the options passed to classify. */
  category: string
  /** 0 to 1. */
  confidence: number
}

/** Picks a category for a transaction description. Returns null when nothing matches confidently. */
export interface Classifier {
  classify(description: string, categories: CategoryOption[]): Promise<Classification | null>
}
