import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { GripVertical, X } from 'lucide-react'
import { useId, type CSSProperties, type KeyboardEventHandler, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { WIDGET_META, type WallSpan, type WidgetId } from './meta'

const SIZE_OPTIONS: ReadonlyArray<readonly [WallSpan, string]> = [
  [3, 'S'],
  [4, 'M'],
  [6, 'L'],
  [8, 'XL'],
  [12, 'Full'],
]

export interface DropMark {
  side: 'before' | 'after'
  /** x: a narrow cell (the mark is a vertical bar). y: a full-width cell (a horizontal bar). */
  axis: 'x' | 'y'
}

export interface WidgetFrameProps {
  id: WidgetId
  span: WallSpan
  editing: boolean
  dragging?: boolean
  drop: DropMark | null
  frameRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  onResize: (span: WallSpan) => void
  onRemove: () => void
  children: ReactNode
}

export function WidgetFrame({
  id,
  span,
  editing,
  dragging = false,
  drop,
  frameRef,
  style,
  attributes,
  listeners,
  onKeyDown,
  onResize,
  onRemove,
  children,
}: WidgetFrameProps) {
  const title = WIDGET_META[id].title
  const hintId = useId()

  return (
    <section
      ref={frameRef}
      style={style}
      aria-label={title}
      data-widget-frame={id}
      {...attributes}
      {...listeners}
      role="group"
      aria-pressed={undefined}
      aria-disabled={undefined}
      aria-describedby={editing ? hintId : undefined}
      tabIndex={editing ? 0 : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        '@container/widget relative flex h-full min-w-0 flex-col rounded-md border border-line bg-surface shadow-panel',
        editing && 'cursor-grab outline-1 outline-dashed -outline-offset-1 outline-line-strong hover:outline-hl focus-visible:outline-2 focus-visible:outline-hl',
        dragging && 'opacity-35',
      )}
    >
      {editing && (
        <span id={hintId} className="sr-only">
          Alt+Arrows move, Alt+Shift+Arrows resize, Delete removes
        </span>
      )}

      {drop && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-10 rounded-full bg-hl ring-3 ring-hl/25',
            drop.axis === 'x' && 'top-0 bottom-0 w-[3px]',
            drop.axis === 'y' && 'right-0 left-0 h-[3px]',
            drop.axis === 'x' && drop.side === 'before' && '-left-2',
            drop.axis === 'x' && drop.side === 'after' && '-right-2',
            drop.axis === 'y' && drop.side === 'before' && '-top-[7px]',
            drop.axis === 'y' && drop.side === 'after' && '-bottom-[7px]',
          )}
        />
      )}

      <header className="flex min-h-8 items-center gap-2 border-b border-line px-3">
        {editing && <GripVertical aria-hidden className="-ml-1 size-4 shrink-0 text-faint" />}
        <h3 className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        <span className="flex-1" />
        {editing && (
          <div className="flex items-center gap-1.5">
            <div role="group" aria-label={`${title} width`} className="flex overflow-hidden rounded-sm border border-line-strong">
              {SIZE_OPTIONS.map(([n, label]) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={span === n}
                  title={`${n} of 12 columns`}
                  onClick={() => onResize(n)}
                  className={cn(
                    'h-5 cursor-pointer px-1.5 font-mono text-[10.5px] text-faint transition-colors hover:bg-surface-3 hover:text-foreground',
                    span === n && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label={`Remove ${title}`}
              onClick={onRemove}
              className="grid size-5 cursor-pointer place-items-center rounded-sm text-faint transition-colors hover:bg-surface-3 hover:text-neg"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        )}
      </header>

      <div inert={editing || undefined} className={cn('min-h-0 flex-1 p-3', editing && 'pointer-events-none select-none')}>
        {children}
      </div>
    </section>
  )
}
