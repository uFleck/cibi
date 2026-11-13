import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { denseCell, denseHead, denseNumCell, denseRow, denseTable } from '@/components/ui/dense'
import { RowActions } from '@/components/ui/row-actions'
import { actionsWidth, ROW_GROUP, type RowAction } from '@/lib/row-actions'

export interface DataColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right'
  /** Monospace tabular figures, for money and counts. */
  numeric?: boolean
  /** Full text for the hover title. Defaults to the cell itself when it renders a plain string. */
  title?: (row: T) => string | null | undefined
  /** Width and visibility on both the header and the cells, e.g. `w-[30%] hidden sm:table-cell`. Give at least one column no width: it takes the rest. */
  className?: string
}

interface DataListProps<T> {
  rows: T[]
  rowId: (row: T) => string
  columns: DataColumn<T>[]
  /** Row actions. They show on hover or focus. */
  actions?: (row: T) => RowAction[]
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode
  'aria-label'?: string
}

/** A compact, fixed-layout table: cells stay on one line and row actions appear on hover. */
export function DataList<T>({ rows, rowId, columns, actions, empty, 'aria-label': ariaLabel }: DataListProps<T>) {
  if (rows.length === 0 && empty !== undefined) {
    return <div className="rounded-md border border-line bg-surface px-3 py-6 text-center text-xs text-faint">{empty}</div>
  }

  const actionCount = actions ? Math.max(0, ...rows.map(row => actions(row).length)) : 0

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <table className={cn(denseTable, 'table-fixed')} aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.id} className={cn(denseHead, column.align === 'right' && 'text-right', column.className)}>
                {column.header}
              </th>
            ))}
            {actionCount > 0 && <th className={denseHead} style={{ width: actionsWidth(actionCount) }} aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const id = rowId(row)
            const rowActions = actions?.(row) ?? []
            return (
              <tr key={id} data-row={id} className={cn(denseRow, ROW_GROUP)}>
                {columns.map(column => {
                  const content = column.cell(row)
                  return (
                    <td
                      key={column.id}
                      title={column.title ? (column.title(row) ?? undefined) : typeof content === 'string' ? content : undefined}
                      className={cn(
                        column.numeric ? denseNumCell : denseCell,
                        'overflow-hidden text-ellipsis',
                        column.align === 'right' && 'text-right',
                        column.className,
                      )}
                    >
                      {content}
                    </td>
                  )
                })}
                {actionCount > 0 && (
                  <td className={denseCell}>
                    <RowActions actions={rowActions} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
