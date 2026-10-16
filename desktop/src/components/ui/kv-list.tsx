import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface KvRow {
  label: ReactNode
  value: ReactNode
}

/** Label and value pairs in a bordered two-column list. */
export function KvList({ rows, className }: { rows: KvRow[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[84px_1fr] overflow-hidden rounded-md border border-line bg-surface', className)}>
      {rows.map((row, index) => (
        <div key={index} className="contents">
          <dt className={cn('px-2.5 py-2 text-faint', index > 0 && 'border-t border-line')}>{row.label}</dt>
          <dd className={cn('flex min-w-0 items-center gap-2 px-2.5 py-2', index > 0 && 'border-t border-line')}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
