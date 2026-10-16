import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/utils'
import { useShell } from '@/shell/contexts'
import { EmptyZone, Tray } from './EditBar'
import { INSP_ZONE_ID, TRAY_ZONE_ID, type DragData } from './dnd'
import type { LayoutApi } from './layoutContext'
import { POSITIONS, type InspectorPos, type InspItem } from './layoutStore'
import { WIDGET_IDS, WIDGET_META, type WidgetId } from './meta'
import { WidgetFrame } from './WidgetFrame'
import { WIDGETS } from './registry'
import type { WidgetData } from './useWorkspace'

const DRAG_DISTANCE_PX = 6
const FALLBACK_FOCUS_SELECTOR = '[aria-label="Widgets not on this page"] button, [data-edit-done]'
const POSITION_LABELS: Record<InspectorPos, string> = { left: 'Left', right: 'Right', off: 'Off' }

/** Tray first (pointer inside it), then the nearest widget, then the empty list itself. */
const collision: CollisionDetection = args => {
  const tray = pointerWithin(args).find(hit => hit.id === TRAY_ZONE_ID)
  if (tray) return [tray]
  const items = args.droppableContainers.filter(c => c.id !== INSP_ZONE_ID && c.id !== TRAY_ZONE_ID)
  const itemHits = closestCenter({ ...args, droppableContainers: items })
  if (itemHits.length > 0) return itemHits
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => c.id === INSP_ZONE_ID) })
}

interface InspectorListProps {
  layout: LayoutApi
  data: WidgetData
}

/** The saved inspector widgets: an ordered vertical list, reorderable in edit mode. */
export function InspectorList({ layout, data }: InspectorListProps) {
  const shell = useShell()
  const editing = shell.editMode
  const { insp, pos } = layout.state.layout
  const ids = insp.map(item => item.id)
  const available = WIDGET_IDS.filter(id => !ids.includes(id))
  const [activeId, setActiveId] = useState<WidgetId | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }))

  useEffect(() => {
    const selector = pendingFocus.current
    if (!selector) return
    pendingFocus.current = null
    document.querySelector<HTMLElement>(selector)?.focus()
  }, [insp])

  function removeAt(index: number) {
    const next = insp[index + 1]
    pendingFocus.current = next ? `[data-widget-frame="${next.id}"]` : FALLBACK_FOCUS_SELECTOR
    layout.dispatch({ type: 'remove', zone: 'insp', id: insp[index].id })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    const info = active.data.current as DragData | undefined
    if (!info || !over) return
    const target = String(over.id)
    if (target === TRAY_ZONE_ID) {
      if (info.from === 'insp') layout.dispatch({ type: 'remove', zone: 'insp', id: info.id })
      return
    }
    const index = target === INSP_ZONE_ID ? ids.length : ids.indexOf(target as WidgetId)
    if (index < 0) return
    if (info.from === 'tray') layout.dispatch({ type: 'add', zone: 'insp', id: info.id, index })
    else layout.dispatch({ type: 'move', zone: 'insp', id: info.id, index })
  }

  function onFrameKey(event: KeyboardEvent<HTMLElement>, item: InspItem, index: number) {
    if (!editing || event.target !== event.currentTarget) return
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const step = event.key === 'ArrowUp' ? -1 : 1
      const target = Math.min(Math.max(index + step, 0), insp.length - 1)
      pendingFocus.current = `[data-widget-frame="${item.id}"]`
      layout.dispatch({ type: 'move', zone: 'insp', id: item.id, index: target })
    } else if (event.key === 'Delete') {
      event.preventDefault()
      removeAt(index)
    }
  }

  function setPosition(next: InspectorPos) {
    layout.dispatch({ type: 'setPos', pos: next })
    shell.setInspectorOpen(next !== 'off' || editing)
  }

  function resetInspector() {
    layout.dispatch({ type: 'reset', zone: 'insp' })
    shell.setInspectorOpen(true)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }: DragStartEvent) => setActiveId((active.data.current as DragData).id)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-2.5">
        {editing && (
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-hl bg-surface-2 p-2.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LayoutGrid aria-hidden className="size-4 text-hl" />
              Customize inspector
            </div>
            <Tray available={available} onAdd={id => layout.dispatch({ type: 'add', zone: 'insp', id })} />
            <div role="group" aria-label="Inspector position" className="flex overflow-hidden rounded-sm border border-line-strong">
              {POSITIONS.map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={pos === option}
                  onClick={() => setPosition(option)}
                  className={cn(
                    'h-6 flex-1 cursor-pointer text-xs text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground',
                    pos === option && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  )}
                >
                  {POSITION_LABELS[option]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetInspector}>Reset</Button>
              <Button type="button" size="sm" data-edit-done className="flex-1" onClick={() => shell.setEditMode(false)}>Done</Button>
            </div>
          </div>
        )}

        <InspectorZone empty={insp.length === 0} editing={editing}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {insp.map((item, index) => (
              <SortableRow
                key={item.id}
                id={item.id}
                editing={editing}
                data={data}
                onKeyDown={event => onFrameKey(event, item, index)}
                onRemove={() => removeAt(index)}
              />
            ))}
          </SortableContext>
        </InspectorZone>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium shadow-panel">
            {WIDGET_META[activeId].title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function InspectorZone({ empty, editing, children }: { empty: boolean; editing: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: INSP_ZONE_ID })
  return (
    <div ref={setNodeRef} className="flex min-h-16 flex-col gap-2.5">
      {children}
      {empty && <EmptyZone editing={editing} label="No widgets in the inspector." />}
    </div>
  )
}

interface SortableRowProps {
  id: WidgetId
  editing: boolean
  data: WidgetData
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onRemove: () => void
}

function SortableRow({ id, editing, data, onKeyDown, onRemove }: SortableRowProps) {
  const reduce = useReducedMotion()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
    data: { id, from: 'insp' } satisfies DragData,
    transition: reduce ? null : undefined,
  })
  const Body = WIDGETS[id].component

  return (
    <WidgetFrame
      id={id}
      span={12}
      editing={editing}
      dragging={isDragging}
      drop={null}
      frameRef={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      attributes={attributes}
      listeners={listeners}
      onKeyDown={onKeyDown}
      onRemove={onRemove}
    >
      <Body data={data} />
    </WidgetFrame>
  )
}
