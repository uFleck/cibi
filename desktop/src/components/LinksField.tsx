import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TransactionLink } from '@/lib/api'

export interface LinksFieldProps {
  id: string
  value: TransactionLink[]
  onChange: (links: TransactionLink[]) => void
}

/** Editable list of links: a url and an optional label each. Rows left without a url are dropped on save. */
export function LinksField({ id, value, onChange }: LinksFieldProps) {
  const update = (index: number, changes: Partial<TransactionLink>) =>
    onChange(value.map((link, i) => (i === index ? { ...link, ...changes } : link)))

  return (
    <div className="flex flex-col gap-2">
      {value.map((link, index) => (
        <div key={index} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
          <Input
            id={index === 0 ? id : undefined}
            aria-label={`Endereço do link ${index + 1}`}
            value={link.url}
            onChange={e => update(index, { url: e.target.value })}
            placeholder="https://..."
            autoComplete="off"
          />
          <Input
            aria-label={`Nome do link ${index + 1}`}
            value={link.label ?? ''}
            onChange={e => update(index, { label: e.target.value })}
            placeholder="Nome"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remover link ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X size={14} />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { url: '', label: null }])}>
          <Plus size={14} />
          Adicionar link
        </Button>
      </div>
    </div>
  )
}
