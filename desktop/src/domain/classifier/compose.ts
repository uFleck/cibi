import type { CategoryOption } from '../categories'
import type { Classification, Classifier, ClassifyOptions } from './types'

/**
 * Tries the classifiers in order and returns the first answer. A classifier that returns null or
 * throws passes the description on to the next one.
 */
export function composeClassifiers(...classifiers: Classifier[]): Classifier {
  return {
    async classify(
      description: string,
      categories: readonly CategoryOption[],
      options?: ClassifyOptions,
    ): Promise<Classification | null> {
      for (const classifier of classifiers) {
        let result: Classification | null = null
        try {
          result = await classifier.classify(description, categories, options)
        } catch {
          result = null
        }
        if (result !== null) return result
      }
      return null
    },
    warm() {
      for (const classifier of classifiers) classifier.warm?.()
    },
  }
}
