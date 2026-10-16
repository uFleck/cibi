// The widget layout (stored as `layout.v1` in AppSetting) and its pure reducer.
//
// A widget lives at most once per zone. The wall is a 12-column grid of {id, span}; the inspector
// is an ordered list of {id}. Unknown ids and invalid spans are dropped on load (sanitizeLayout),
// so removing a widget from the registry later cannot break a saved layout.

import { WIDGET_META, isWallSpan, isWidgetId, type WallSpan, type WidgetId } from './meta'

/** AppSetting keys the layout is saved under (see widgets/LayoutProvider.tsx). */
export const LAYOUT_KEY = 'layout.v1'
export const BASE_KEY = 'layout.base'
export const LAYOUT_QUERY_KEY = ['settings', 'layout'] as const
export const SAVE_DELAY_MS = 400

export const POSITIONS = ['left', 'right', 'off'] as const
export type InspectorPos = (typeof POSITIONS)[number]

export type Zone = 'wall' | 'insp'

export interface WallItem {
  id: WidgetId
  span: WallSpan
}

export interface InspItem {
  id: WidgetId
}

export interface Layout {
  pos: InspectorPos
  wall: WallItem[]
  insp: InspItem[]
}

export const PRESET_IDS = ['w1', 'w2', 'w3', 'w4'] as const
export type PresetId = (typeof PRESET_IDS)[number]

type PresetEntry = [WidgetId, WallSpan]

const preset = (entries: PresetEntry[]): WallItem[] => entries.map(([id, span]) => ({ id, span }))

export const PRESETS: Record<PresetId, { name: string; wall: WallItem[] }> = {
  w1: {
    name: 'W1 Balanced',
    wall: preset([
      ['kpis', 12], ['projection', 8], ['check', 4], ['budget', 6], ['upcoming', 6], ['recent', 12],
      ['categories', 6], ['payday', 3], ['goals', 3], ['accounts', 6], ['friends', 6],
    ]),
  },
  w2: {
    name: 'W2 Projection',
    wall: preset([
      ['kpis', 12], ['projection', 12], ['check', 4], ['budget', 4], ['payday', 4], ['upcoming', 6],
      ['categories', 6], ['recent', 12], ['goals', 4], ['accounts', 4], ['friends', 4],
    ]),
  },
  w3: {
    name: 'W3 Ledger',
    wall: preset([
      ['kpis', 12], ['recent', 8], ['upcoming', 4], ['budget', 4], ['projection', 8], ['categories', 4],
      ['check', 4], ['payday', 4], ['goals', 4], ['accounts', 4], ['friends', 4],
    ]),
  },
  w4: {
    name: 'W4 Compact',
    wall: preset([
      ['kpis', 12], ['projection', 6], ['budget', 6], ['upcoming', 4], ['categories', 4], ['check', 4],
      ['recent', 12], ['payday', 3], ['goals', 3], ['accounts', 3], ['friends', 3],
    ]),
  },
}

export const DEFAULT_PRESET: PresetId = 'w1'
export const DEFAULT_POS: InspectorPos = 'right'
export const DEFAULT_INSPECTOR: WidgetId[] = ['projection', 'payday', 'goals']

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && (PRESET_IDS as readonly string[]).includes(value)
}

function isPos(value: unknown): value is InspectorPos {
  return typeof value === 'string' && (POSITIONS as readonly string[]).includes(value)
}

function defaultWall(presetId: PresetId): WallItem[] {
  return PRESETS[presetId].wall.map(item => ({ ...item }))
}

function defaultInsp(): InspItem[] {
  return DEFAULT_INSPECTOR.map(id => ({ id }))
}

export function defaultLayout(presetId: PresetId = DEFAULT_PRESET): Layout {
  return { pos: DEFAULT_POS, wall: defaultWall(presetId), insp: defaultInsp() }
}

/** The layout plus the preset that Reset returns the wall to (stored as `layout.base`). */
export interface LayoutState {
  layout: Layout
  base: PresetId
}

export function initialLayoutState(): LayoutState {
  return { layout: defaultLayout(), base: DEFAULT_PRESET }
}

export type LayoutAction =
  | { type: 'load'; state: LayoutState }
  | { type: 'add'; zone: Zone; id: WidgetId; index?: number }
  | { type: 'remove'; zone: Zone; id: WidgetId }
  /** Places id at index in the resulting list (the arrayMove convention). */
  | { type: 'move'; zone: Zone; id: WidgetId; index: number }
  | { type: 'resize'; id: WidgetId; span: WallSpan }
  | { type: 'setPos'; pos: InspectorPos }
  | { type: 'applyPreset'; preset: PresetId }
  /** Wall: back to the base preset. Inspector: default widgets, position right. */
  | { type: 'reset'; zone: Zone }

function insertAt<T>(list: T[], item: T, index?: number): T[] {
  const at = index === undefined ? list.length : Math.min(Math.max(index, 0), list.length)
  return [...list.slice(0, at), item, ...list.slice(at)]
}

function moveItem<T extends { id: WidgetId }>(list: T[], id: WidgetId, index: number): T[] {
  const from = list.findIndex(item => item.id === id)
  if (from < 0) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  return insertAt(next, item, index)
}

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  const { layout } = state
  switch (action.type) {
    case 'load':
      return action.state

    case 'add': {
      if (!isWidgetId(action.id)) return state
      if (action.zone === 'wall') {
        if (layout.wall.some(item => item.id === action.id)) return state
        const wall = insertAt(layout.wall, { id: action.id, span: WIDGET_META[action.id].span }, action.index)
        return { ...state, layout: { ...layout, wall } }
      }
      if (layout.insp.some(item => item.id === action.id)) return state
      return { ...state, layout: { ...layout, insp: insertAt(layout.insp, { id: action.id }, action.index) } }
    }

    case 'remove': {
      if (action.zone === 'wall') {
        return { ...state, layout: { ...layout, wall: layout.wall.filter(item => item.id !== action.id) } }
      }
      return { ...state, layout: { ...layout, insp: layout.insp.filter(item => item.id !== action.id) } }
    }

    case 'move': {
      const list = action.zone === 'wall' ? layout.wall : layout.insp
      if (!list.some(item => item.id === action.id)) return state
      if (action.zone === 'wall') {
        return { ...state, layout: { ...layout, wall: moveItem(layout.wall, action.id, action.index) } }
      }
      return { ...state, layout: { ...layout, insp: moveItem(layout.insp, action.id, action.index) } }
    }

    case 'resize': {
      if (!isWallSpan(action.span)) return state
      if (!layout.wall.some(item => item.id === action.id)) return state
      const wall = layout.wall.map(item => (item.id === action.id ? { ...item, span: action.span } : item))
      return { ...state, layout: { ...layout, wall } }
    }

    case 'setPos':
      if (!isPos(action.pos)) return state
      return { ...state, layout: { ...layout, pos: action.pos } }

    case 'applyPreset':
      if (!isPresetId(action.preset)) return state
      return { base: action.preset, layout: { ...layout, wall: defaultWall(action.preset) } }

    case 'reset':
      if (action.zone === 'wall') {
        return { ...state, layout: { ...layout, wall: defaultWall(state.base) } }
      }
      return { ...state, layout: { ...layout, pos: DEFAULT_POS, insp: defaultInsp() } }

    default:
      return state
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeWall(entries: unknown[]): WallItem[] {
  const seen = new Set<WidgetId>()
  const wall: WallItem[] = []
  for (const entry of entries) {
    if (!isRecord(entry) || !isWidgetId(entry.id) || seen.has(entry.id)) continue
    seen.add(entry.id)
    wall.push({ id: entry.id, span: isWallSpan(entry.span) ? entry.span : WIDGET_META[entry.id].span })
  }
  return wall
}

function sanitizeInsp(entries: unknown[]): InspItem[] {
  const seen = new Set<WidgetId>()
  const insp: InspItem[] = []
  for (const entry of entries) {
    if (!isRecord(entry) || !isWidgetId(entry.id) || seen.has(entry.id)) continue
    seen.add(entry.id)
    insp.push({ id: entry.id })
  }
  return insp
}

/**
 * Turns a loaded value into a valid layout. Anything that is not an object gives the preset's
 * defaults. A zone that is not an array gives that zone's defaults. Bad entries (unknown ids,
 * duplicates, invalid spans) are dropped, or get the widget's default span.
 */
export function sanitizeLayout(raw: unknown, fallbackPreset: PresetId = DEFAULT_PRESET): Layout {
  const fallback = defaultLayout(fallbackPreset)
  if (!isRecord(raw)) return fallback
  return {
    pos: isPos(raw.pos) ? raw.pos : DEFAULT_POS,
    wall: Array.isArray(raw.wall) ? sanitizeWall(raw.wall) : fallback.wall,
    insp: Array.isArray(raw.insp) ? sanitizeInsp(raw.insp) : fallback.insp,
  }
}

export function sanitizePreset(raw: unknown): PresetId {
  return isPresetId(raw) ? raw : DEFAULT_PRESET
}
