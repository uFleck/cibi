import { createContext, useContext, type Dispatch } from 'react'
import type { LayoutAction, LayoutState } from './layoutStore'

export interface LayoutApi {
  state: LayoutState
  dispatch: Dispatch<LayoutAction>
}

export const LayoutContext = createContext<LayoutApi | null>(null)

/** The layout and its dispatcher, or null until the saved layout has loaded. */
export function useLayout(): LayoutApi | null {
  return useContext(LayoutContext)
}
