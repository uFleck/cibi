// Picks a category from a transaction description. The active classifier is set once at startup;
// the rules classifier is the default. The Laya model is registered in src/lib/laya.ts.

import type { CategoryOption } from '../categories'
import { rulesClassifier } from './rules'
import type { Classification, Classifier, ClassifyOptions } from './types'

export type { Classification, Classifier, ClassifyOptions } from './types'
export { rulesClassifier } from './rules'

/** A suggestion below this confidence is not offered or stored. */
export const MIN_CONFIDENCE = 0.8

let active: Classifier = rulesClassifier

export function setClassifier(classifier: Classifier): void {
  active = classifier
}

export function getClassifier(): Classifier {
  return active
}

/** The text the classifier reads for a transaction: its title, then its description when it has one. */
export function classificationText(title: string, description: string | null | undefined): string {
  const detail = description?.trim() ?? ''
  return detail === '' ? title : `${title}. ${detail}`
}

/**
 * The classifier's answer when it is confident and names one of the given options. Never throws:
 * a failing classifier means no suggestion.
 */
export async function suggestCategory(
  description: string,
  categories: readonly CategoryOption[],
  options?: ClassifyOptions,
): Promise<Classification | null> {
  if (description.trim() === '' || categories.length === 0) return null
  try {
    const result = await getClassifier().classify(description, [...categories], options)
    if (result === null || result.confidence < (result.minConfidence ?? MIN_CONFIDENCE)) return null
    return categories.some((c) => c.label === result.category) ? result : null
  } catch {
    return null
  }
}
