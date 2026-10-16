// Wall spans at each window width (the table in docs/plans/2026-10-15-ui-redesign.md).
// Breakpoints are window widths: the wall reflows with the window, widgets adapt to their cell.

import { useMediaQuery } from '@/hooks/use-media-query'
import type { WallSpan } from './meta'

export type WallMode = 'full' | 'compact' | 'two' | 'one'

export const BREAKPOINTS = { full: 1100, compact: 900, two: 640 } as const

export function wallModeFor(width: number): WallMode {
  if (width >= BREAKPOINTS.full) return 'full'
  if (width >= BREAKPOINTS.compact) return 'compact'
  if (width >= BREAKPOINTS.two) return 'two'
  return 'one'
}

/** The span a widget takes in the given mode. The saved span is unchanged; only the rendering differs. */
export function effectiveSpan(span: WallSpan, mode: WallMode): WallSpan {
  switch (mode) {
    case 'full':
      return span
    case 'compact':
      return span === 8 || span === 4 ? 6 : span
    case 'two':
      return span === 12 ? 12 : 6
    case 'one':
      return 12
  }
}

export function useWallMode(): WallMode {
  const full = useMediaQuery(`(min-width: ${BREAKPOINTS.full}px)`)
  const compact = useMediaQuery(`(min-width: ${BREAKPOINTS.compact}px)`)
  const two = useMediaQuery(`(min-width: ${BREAKPOINTS.two}px)`)
  if (full) return 'full'
  if (compact) return 'compact'
  if (two) return 'two'
  return 'one'
}
