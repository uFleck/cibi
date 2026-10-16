import type { ReactNode } from 'react'

export const pageEyebrow = 'font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint'

export const pageShell = 'mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6'

type PageHeaderProps = {
  eyebrow: string
  title: string
  description: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className={pageEyebrow}>{eyebrow}</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-[12px] text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  )
}
