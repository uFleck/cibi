import { useDraggable, useDroppable } from '@dnd-kit/core'
import { LayoutGrid, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useShell } from '@/shell/contexts'
import { TRAY_ZONE_ID, type DragData } from './dnd'
import type { LayoutApi } from './layoutContext'
import { WIDGET_IDS, WIDGET_META, type WidgetId } from './meta'
import { PRESETS, PRESET_IDS } from './layoutStore'

interface EditBarProps {
  layout: LayoutApi
}

export function EditBar({ layout }: EditBarProps) {
  const shell = useShell()
  const { wall } = layout.state.layout
  const base = layout.state.base
  const onWall = new Set(wall.map(item => item.id))
  const available = WIDGET_IDS.filter(id => !onWall.has(id))

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-hl bg-surface-2 px-2.5 py-2">
      <LayoutGrid aria-hidden className="size-4 text-hl" />
      <span className="text-sm font-medium">Customize overview</span>
      <span className="hidden text-xs text-muted-foreground xl:inline">Drag by the grip, or use Alt+Arrow and Alt+Shift+Arrow on a focused widget</span>

      <Tray available={available} onAdd={id => layout.dispatch({ type: 'add', zone: 'wall', id })} />

      <div role="group" aria-label="Preset" className="flex overflow-hidden rounded-sm border border-line-strong">
        {PRESET_IDS.map(id => (
          <button
            key={id}
            type="button"
            aria-pressed={base === id}
            onClick={() => layout.dispatch({ type: 'applyPreset', preset: id })}
            className={cn(
              'h-6 cursor-pointer px-2 text-xs text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground',
              base === id && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
            )}
          >
            {PRESETS[id].name}
          </button>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => layout.dispatch({ type: 'reset', zone: 'wall' })}>
        Reset
      </Button>
      <Button type="button" size="sm" data-edit-done onClick={() => shell.setEditMode(false)}>
        Done
      </Button>
    </div>
  )
}

interface TrayProps {
  available: WidgetId[]
  onAdd: (id: WidgetId) => void
}

/** Widgets not in the current zone. Drop a chip on the page to add it, or click it. */
export function Tray({ available, onAdd }: TrayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ZONE_ID })
  return (
    <div
      ref={setNodeRef}
      aria-label="Widgets not on this page"
      className={cn(
        'flex min-h-7 min-w-[200px] flex-1 flex-wrap items-center gap-1.5 rounded-sm border border-dashed border-line-strong bg-surface px-2 py-0.5',
        isOver && 'border-hl bg-hl/10',
      )}
    >
      {available.length === 0 ? (
        <span className="text-xs text-muted-foreground">Every widget is on the page</span>
      ) : (
        available.map(id => <TrayChip key={id} id={id} onAdd={() => onAdd(id)} />)
      )}
    </div>
  )
}

function TrayChip({ id, onAdd }: { id: WidgetId; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray:${id}`,
    data: { id, from: 'tray' } satisfies DragData,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      title="Drag onto the page, or click to add"
      onClick={onAdd}
      {...attributes}
      {...listeners}
      className={cn(
        'inline-flex h-6 cursor-grab items-center gap-1 rounded-sm border border-line-strong bg-surface px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-hl hover:text-foreground',
        isDragging && 'opacity-40',
      )}
    >
      <Plus aria-hidden className="size-3" />
      {WIDGET_META[id].title}
    </button>
  )
}
