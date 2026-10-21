import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSetting, putSetting } from '@/lib/api'
import { LayoutContext, type LayoutApi } from './layoutContext'
import {
  BASE_KEY,
  LAYOUT_KEY,
  LAYOUT_QUERY_KEY,
  SAVE_DELAY_MS,
  initialLayoutState,
  layoutReducer,
  sanitizeLayout,
  sanitizePreset,
  type LayoutAction,
  type LayoutState,
} from './layoutStore'

async function fetchLayoutState(): Promise<LayoutState> {
  const [rawLayout, rawBase] = await Promise.all([getSetting<unknown>(LAYOUT_KEY), getSetting<unknown>(BASE_KEY)])
  const base = sanitizePreset(rawBase)
  return { layout: sanitizeLayout(rawLayout, base), base }
}

type HostAction = { type: 'hydrate'; state: LayoutState } | LayoutAction

/** Null until hydrated. The first hydrate wins; later ones are ignored. */
function hostReducer(state: LayoutState | null, action: HostAction): LayoutState | null {
  if (action.type === 'hydrate') return state ?? action.state
  if (state === null) return null
  return layoutReducer(state, action)
}

/**
 * Loads the saved layout once, then keeps it saved. Consumers see null until the load settles.
 * The provider element never changes type, so the page below it is not remounted when the load lands.
 *
 * Saves are allowed only when the state was hydrated from a successful load. A failed load shows
 * the defaults but never writes them, even if the query recovers later.
 */
export function LayoutProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: LAYOUT_QUERY_KEY,
    queryFn: fetchLayoutState,
    staleTime: Infinity,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  const settled = !query.isPending

  const [state, dispatch] = useReducer(hostReducer, null)
  const persistRef = useRef(false)
  const saved = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<LayoutState | null>(null)

  useEffect(() => {
    if (!settled || state !== null) return
    persistRef.current = query.isSuccess
    dispatch({ type: 'hydrate', state: query.data ?? initialLayoutState() })
  }, [settled, state, query.data, query.isSuccess])

  useEffect(() => {
    if (query.isError) toast.error('Não deu para carregar seu painel. Mostrando o padrão, e as alterações não serão salvas.')
  }, [query.isError])

  const save = useCallback(() => {
    window.clearTimeout(timer.current)
    const next = pending.current
    if (!next) return
    pending.current = null
    Promise.all([putSetting(LAYOUT_KEY, next.layout), putSetting(BASE_KEY, next.base)]).catch(() => {
      toast.error('Não deu para salvar o painel')
    })
  }, [])

  useEffect(() => {
    if (state === null || !persistRef.current) return
    const json = JSON.stringify(state)
    if (saved.current === null) {
      saved.current = json
      return
    }
    if (json === saved.current) return
    saved.current = json
    pending.current = state
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(save, SAVE_DELAY_MS)
  }, [state, save])

  useEffect(() => {
    window.addEventListener('pagehide', save)
    window.addEventListener('beforeunload', save)
    return () => {
      window.removeEventListener('pagehide', save)
      window.removeEventListener('beforeunload', save)
      save()
    }
  }, [save])

  const value = useMemo<LayoutApi | null>(() => (state === null ? null : { state, dispatch }), [state])
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}
