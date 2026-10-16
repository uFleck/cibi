import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { MotionConfig, motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useShell } from '@/shell/contexts'
import { EditBar, EmptyZone } from './EditBar'
import { WIDGET_META, WALL_SPANS, type WallSpan, type WidgetId } from './meta'
import { TRAY_ZONE_ID, WALL_ZONE_ID, type DragData } from './dnd'
import { effectiveSpan, useWallMode } from './responsive'
import type { LayoutApi } from './layoutContext'
import type { WallItem } from './layoutStore'
import { WidgetFrame, type DropMark } from './WidgetFrame'
import { WIDGETS } from './registry'
import type { WidgetData } from './useWorkspace'

const EASE = [0.2, 0, 0, 1] as const
const DRAG_DISTANCE_PX = 6
/** Where focus goes after the last widget is removed: the first tray chip, else the Done button. */
const FALLBACK_FOCUS_SELECTOR = '[aria-label="Widgets not on this page"] button, [data-edit-done]'

/**
 * Tray first (pointer inside it). Otherwise the nearest wall cell, so a drop never lands on the
 * container's own rect. The wall container is used only when it has no cells yet.
 */
const collision: CollisionDetection = args => {
  const tray = pointerWithin(args).find(hit => hit.id === TRAY_ZONE_ID)
  if (tray) return [tray]
  const cells = args.droppableContainers.filter(c => c.id !== WALL_ZONE_ID && c.id !== TRAY_ZONE_ID)
  const cellHits = closestCenter({ ...args, droppableContainers: cells })
  if (cellHits.length > 0) return cellHits
  const zone = args.droppableContainers.filter(c => c.id === WALL_ZONE_ID)
  return rectIntersection({ ...args, droppableContainers: zone })
}

interface DragState {
  id: WidgetId
  from: DragData['from']
  over: string | null
}

interface WallGridProps {
  layout: LayoutApi
  data: WidgetData
}

export function WallGrid({ layout, data }: WallGridProps) {
  const shell = useShell()
  const mode = useWallMode()
  const reduce = useReducedMotion()
  const [drag, setDrag] = useState<DragState | null>(null)
  /** A selector to focus after the next render (set by moves and removals). */
  const pendingFocus = useRef<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }))

  const { wall } = layout.state.layout
  const ids = wall.map(item => item.id)
  const editing = shell.editMode

  useEffect(() => {
    const selector = pendingFocus.current
    if (!selector) return
    pendingFocus.current = null
    document.querySelector<HTMLElement>(selector)?.focus()
  }, [wall])

  function removeAt(index: number) {
    const item = wall[index]
    const next = wall[index + 1]
    pendingFocus.current = next ? `[data-widget-frame="${next.id}"]` : FALLBACK_FOCUS_SELECTOR
    layout.dispatch({ type: 'remove', zone: 'wall', id: item.id })
  }

  function onDragStart({ active }: DragStartEvent) {
    const info = active.data.current as DragData
    setDrag({ id: info.id, from: info.from, over: null })
  }

  function onDragOver({ over }: DragOverEvent) {
    const next = over ? String(over.id) : null
    setDrag(prev => (prev && prev.over !== next ? { ...prev, over: next } : prev))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDrag(null)
    const info = active.data.current as DragData | undefined
    if (!info || !over) return
    const target = String(over.id)
    if (target === TRAY_ZONE_ID) {
      if (info.from === 'wall') layout.dispatch({ type: 'remove', zone: 'wall', id: info.id })
      return
    }
    const index = target === WALL_ZONE_ID ? wall.length : ids.indexOf(target as WidgetId)
    if (index < 0) return
    if (info.from === 'tray') layout.dispatch({ type: 'add', zone: 'wall', id: info.id, index })
    else layout.dispatch({ type: 'move', zone: 'wall', id: info.id, index })
  }

  function dropMarkFor(id: WidgetId, span: WallSpan): DropMark | null {
    if (!drag || drag.over !== id) return null
    if (drag.from === 'wall' && drag.id === id) return null
    const overIndex = ids.indexOf(id)
    const before = drag.from === 'tray' || ids.indexOf(drag.id) > overIndex
    return { side: before ? 'before' : 'after', axis: span < 12 ? 'x' : 'y' }
  }

  function onFrameKey(event: KeyboardEvent<HTMLElement>, item: WallItem, index: number) {
    if (!editing || event.target !== event.currentTarget) return
    const { key } = event
    if (event.altKey && key.startsWith('Arrow')) {
      event.preventDefault()
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
      if (event.shiftKey) {
        const next = WALL_SPANS.indexOf(item.span) + step
        if (next >= 0 && next < WALL_SPANS.length) layout.dispatch({ type: 'resize', id: item.id, span: WALL_SPANS[next] })
      } else {
        const target = Math.min(Math.max(index + step, 0), wall.length - 1)
        pendingFocus.current = `[data-widget-frame="${item.id}"]`
        layout.dispatch({ type: 'move', zone: 'wall', id: item.id, index: target })
      }
    } else if (key === 'Delete') {
      event.preventDefault()
      removeAt(index)
    }
  }

  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'} transition={{ duration: 0.25, ease: EASE }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <div className="flex flex-col gap-3">
          {editing && <EditBar layout={layout} />}
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <WallZone empty={wall.length === 0} editing={editing}>
              {wall.map((item, index) => {
                const span = effectiveSpan(item.span, mode)
                return (
                  <SortableCell
                    key={item.id}
                    item={item}
                    index={index}
                    span={span}
                    editing={editing}
                    drop={dropMarkFor(item.id, span)}
                    data={data}
                    onKeyDown={event => onFrameKey(event, item, index)}
                    onResize={next => layout.dispatch({ type: 'resize', id: item.id, span: next })}
                    onRemove={() => removeAt(index)}
                  />
                )
              })}
            </WallZone>
          </SortableContext>
        </div>
        <DragOverlay dropAnimation={null}>
          {drag ? (
            <div className="rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium shadow-panel">
              {WIDGET_META[drag.id].title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </MotionConfig>
  )
}

function WallZone({ empty, editing, children }: { empty: boolean; editing: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: WALL_ZONE_ID })
  return (
    <div ref={setNodeRef} className="grid min-h-16 grid-cols-12 gap-3">
      {children}
      {empty && (
        <div className="col-span-12">
          <EmptyZone editing={editing} label="No widgets on this wall." />
        </div>
      )}
    </div>
  )
}

interface SortableCellProps {
  item: WallItem
  index: number
  span: WallSpan
  editing: boolean
  drop: DropMark | null
  data: WidgetData
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onResize: (span: WallSpan) => void
  onRemove: () => void
}

function SortableCell({ item, span, editing, drop, data, onKeyDown, onResize, onRemove }: SortableCellProps) {
  const reduce = useReducedMotion()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editing,
    data: { id: item.id, from: 'wall' } satisfies DragData,
    transition: reduce ? null : undefined,
  })
  const Body = WIDGETS[item.id].component

  return (
    <motion.div layout={!reduce} className="min-w-0" style={{ gridColumn: `span ${span} / span ${span}` }}>
      <WidgetFrame
        id={item.id}
        span={item.span}
        editing={editing}
        dragging={isDragging}
        drop={drop}
        frameRef={setNodeRef}
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          transition,
        }}
        attributes={attributes}
        listeners={listeners}
        onKeyDown={onKeyDown}
        onResize={onResize}
        onRemove={onRemove}
      >
        <Body data={data} />
      </WidgetFrame>
    </motion.div>
  )
}
