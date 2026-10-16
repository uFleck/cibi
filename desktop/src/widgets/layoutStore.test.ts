import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INSPECTOR,
  PRESETS,
  initialLayoutState,
  layoutReducer,
  sanitizeLayout,
  sanitizePreset,
  type LayoutState,
} from './layoutStore'
import { WIDGET_IDS } from './meta'

function stateWith(wall: LayoutState['layout']['wall'], insp: LayoutState['layout']['insp'] = [], base: LayoutState['base'] = 'w1'): LayoutState {
  return { base, layout: { pos: 'right', wall, insp } }
}

const ids = (list: { id: string }[]) => list.map(item => item.id)

describe('defaults', () => {
  it('starts from W1 Balanced with the default inspector', () => {
    const state = initialLayoutState()
    expect(state.base).toBe('w1')
    expect(state.layout.wall).toEqual(PRESETS.w1.wall)
    expect(ids(state.layout.insp)).toEqual(DEFAULT_INSPECTOR)
    expect(state.layout.pos).toBe('right')
  })

  it('every preset places each of the eleven widgets exactly once', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.wall.map(item => item.id).sort()).toEqual([...WIDGET_IDS].sort())
    }
  })
})

describe('move', () => {
  it('reorders a wall widget to the given final index', () => {
    const state = stateWith([
      { id: 'kpis', span: 12 },
      { id: 'goals', span: 4 },
      { id: 'friends', span: 4 },
    ])
    const next = layoutReducer(state, { type: 'move', zone: 'wall', id: 'kpis', index: 2 })
    expect(ids(next.layout.wall)).toEqual(['goals', 'friends', 'kpis'])
    expect(next.layout.wall[2].span).toBe(12)
  })

  it('moves an inspector widget backwards', () => {
    const state = stateWith([], [{ id: 'projection' }, { id: 'payday' }, { id: 'goals' }])
    const next = layoutReducer(state, { type: 'move', zone: 'insp', id: 'goals', index: 0 })
    expect(ids(next.layout.insp)).toEqual(['goals', 'projection', 'payday'])
  })

  it('does nothing for an id that is not in the zone', () => {
    const state = stateWith([{ id: 'kpis', span: 12 }])
    expect(layoutReducer(state, { type: 'move', zone: 'wall', id: 'goals', index: 0 })).toBe(state)
  })

  it('clamps an index past the end to the last place', () => {
    const state = stateWith([{ id: 'kpis', span: 12 }, { id: 'goals', span: 4 }])
    const next = layoutReducer(state, { type: 'move', zone: 'wall', id: 'kpis', index: 99 })
    expect(ids(next.layout.wall)).toEqual(['goals', 'kpis'])
  })
})

describe('resize', () => {
  it('changes the span of a wall widget to an allowed span', () => {
    const state = stateWith([{ id: 'goals', span: 4 }, { id: 'kpis', span: 12 }])
    const next = layoutReducer(state, { type: 'resize', id: 'goals', span: 6 })
    expect(next.layout.wall).toEqual([{ id: 'goals', span: 6 }, { id: 'kpis', span: 12 }])
  })

  it('rejects a span outside {3,4,6,8,12}', () => {
    const state = stateWith([{ id: 'goals', span: 4 }])
    expect(layoutReducer(state, { type: 'resize', id: 'goals', span: 5 as never })).toBe(state)
  })

  it('ignores a widget that is not on the wall', () => {
    const state = stateWith([{ id: 'goals', span: 4 }])
    expect(layoutReducer(state, { type: 'resize', id: 'kpis', span: 6 })).toBe(state)
  })
})

describe('remove and add', () => {
  it('removes a widget from its zone only', () => {
    const state = stateWith([{ id: 'goals', span: 4 }], [{ id: 'goals' }])
    const next = layoutReducer(state, { type: 'remove', zone: 'wall', id: 'goals' })
    expect(next.layout.wall).toEqual([])
    expect(ids(next.layout.insp)).toEqual(['goals'])
  })

  it('adds a wall widget with its default span at the end', () => {
    const state = stateWith([{ id: 'kpis', span: 12 }])
    const next = layoutReducer(state, { type: 'add', zone: 'wall', id: 'budget' })
    expect(next.layout.wall).toEqual([{ id: 'kpis', span: 12 }, { id: 'budget', span: 6 }])
  })

  it('adds at the given index', () => {
    const state = stateWith([{ id: 'kpis', span: 12 }, { id: 'recent', span: 12 }])
    const next = layoutReducer(state, { type: 'add', zone: 'wall', id: 'check', index: 1 })
    expect(ids(next.layout.wall)).toEqual(['kpis', 'check', 'recent'])
  })

  it('keeps a widget at most once per zone', () => {
    const state = stateWith([{ id: 'kpis', span: 12 }], [{ id: 'goals' }])
    expect(layoutReducer(state, { type: 'add', zone: 'wall', id: 'kpis' })).toBe(state)
    expect(layoutReducer(state, { type: 'add', zone: 'insp', id: 'goals' })).toBe(state)
  })

  it('lets a widget live in both zones', () => {
    const state = stateWith([{ id: 'kpis', span: 12 }])
    const next = layoutReducer(state, { type: 'add', zone: 'insp', id: 'kpis' })
    expect(ids(next.layout.insp)).toEqual(['kpis'])
    expect(ids(next.layout.wall)).toEqual(['kpis'])
  })

  it('ignores an unknown id', () => {
    const state = stateWith([{ id: 'kpis', span: 12 }])
    expect(layoutReducer(state, { type: 'add', zone: 'wall', id: 'gone' as never })).toBe(state)
  })
})

describe('setPos', () => {
  it('sets the inspector position', () => {
    const state = initialLayoutState()
    expect(layoutReducer(state, { type: 'setPos', pos: 'off' }).layout.pos).toBe('off')
  })
})

describe('presets and reset', () => {
  it('applyPreset replaces the wall and remembers the preset as base', () => {
    const next = layoutReducer(initialLayoutState(), { type: 'applyPreset', preset: 'w4' })
    expect(next.base).toBe('w4')
    expect(next.layout.wall).toEqual(PRESETS.w4.wall)
  })

  it('reset on the wall returns to the last applied preset, not W1', () => {
    let state = layoutReducer(initialLayoutState(), { type: 'applyPreset', preset: 'w3' })
    state = layoutReducer(state, { type: 'remove', zone: 'wall', id: 'kpis' })
    state = layoutReducer(state, { type: 'reset', zone: 'wall' })
    expect(state.layout.wall).toEqual(PRESETS.w3.wall)
    expect(state.base).toBe('w3')
  })

  it('reset on the inspector restores the defaults and the right position', () => {
    let state = layoutReducer(initialLayoutState(), { type: 'setPos', pos: 'left' })
    state = layoutReducer(state, { type: 'remove', zone: 'insp', id: 'payday' })
    state = layoutReducer(state, { type: 'reset', zone: 'insp' })
    expect(ids(state.layout.insp)).toEqual(DEFAULT_INSPECTOR)
    expect(state.layout.pos).toBe('right')
  })

  it('reset on the wall leaves the inspector alone', () => {
    const state = stateWith([], [{ id: 'goals' }])
    expect(layoutReducer(state, { type: 'reset', zone: 'wall' }).layout.insp).toEqual([{ id: 'goals' }])
  })
})

describe('load and sanitize', () => {
  it('sanitizeLayout drops unknown ids silently', () => {
    const layout = sanitizeLayout({
      pos: 'left',
      wall: [{ id: 'kpis', span: 12 }, { id: 'retired-widget', span: 6 }],
      insp: [{ id: 'goals' }, { id: 'nope' }],
    })
    expect(layout).toEqual({ pos: 'left', wall: [{ id: 'kpis', span: 12 }], insp: [{ id: 'goals' }] })
  })

  it('keeps the first of duplicate ids within a zone', () => {
    const layout = sanitizeLayout({
      pos: 'right',
      wall: [{ id: 'goals', span: 4 }, { id: 'goals', span: 8 }],
      insp: [{ id: 'goals' }, { id: 'goals' }],
    })
    expect(layout.wall).toEqual([{ id: 'goals', span: 4 }])
    expect(layout.insp).toEqual([{ id: 'goals' }])
  })

  it('gives a widget its default span when the saved span is invalid', () => {
    const layout = sanitizeLayout({ pos: 'right', wall: [{ id: 'budget', span: 5 }, { id: 'kpis' }], insp: [] })
    expect(layout.wall).toEqual([{ id: 'budget', span: 6 }, { id: 'kpis', span: 12 }])
  })

  it.each([
    ['null', null],
    ['a string', 'garbage'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
  ])('falls back to the defaults for %s', (_label, raw) => {
    expect(sanitizeLayout(raw)).toEqual(initialLayoutState().layout)
  })

  it('uses the base preset as the wall fallback', () => {
    expect(sanitizeLayout(null, 'w2').wall).toEqual(PRESETS.w2.wall)
  })

  it('a zone that is not an array gets that zone default, the other zone is kept', () => {
    const layout = sanitizeLayout({ pos: 'off', wall: 'nope', insp: [{ id: 'check' }] })
    expect(layout.wall).toEqual(PRESETS.w1.wall)
    expect(layout.insp).toEqual([{ id: 'check' }])
    expect(layout.pos).toBe('off')
  })

  it('an invalid position falls back to right', () => {
    expect(sanitizeLayout({ pos: 'top', wall: [], insp: [] }).pos).toBe('right')
  })

  it('entries that are not objects are dropped', () => {
    expect(sanitizeLayout({ pos: 'right', wall: [null, 3, 'kpis', { id: 'kpis', span: 12 }], insp: [] }).wall).toEqual([
      { id: 'kpis', span: 12 },
    ])
  })

  it('sanitizePreset accepts only known presets', () => {
    expect(sanitizePreset('w2')).toBe('w2')
    expect(sanitizePreset('w9')).toBe('w1')
    expect(sanitizePreset(undefined)).toBe('w1')
  })

  it('load replaces the whole state', () => {
    const loaded = stateWith([{ id: 'check', span: 4 }], [], 'w4')
    expect(layoutReducer(initialLayoutState(), { type: 'load', state: loaded })).toBe(loaded)
  })
})
