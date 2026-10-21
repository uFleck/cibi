import { ArrowDown, ArrowUp, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { EditSheet } from '@/components/EditSheet'
import type { WindowLabels } from '@/lib/transactions-impact'

export type TransactionPreset =
  | 'due-now'
  | 'current-window'
  | 'next-window'
  | 'all-recurring'
  | 'one-time-only'

export interface TransactionFiltersProps {
  showFilters: boolean
  hasActiveFilters: boolean
  preset: TransactionPreset | null
  sortField: 'title' | 'date' | 'amount'
  sortDir: 'asc' | 'desc'
  searchQuery: string
  amountMin: string
  amountMax: string
  windowLabels: WindowLabels | null
  onToggleFilters: () => void
  onPresetChange: (value: TransactionPreset | null) => void
  onSortFieldChange: (value: 'title' | 'date' | 'amount') => void
  onSortDirChange: (value: 'asc' | 'desc') => void
  onSearchQueryChange: (value: string) => void
  onAmountMinChange: (value: string) => void
  onAmountMaxChange: (value: string) => void
  onResetFilters: () => void
}

export function TransactionFilters({
  showFilters,
  hasActiveFilters,
  preset,
  sortField,
  sortDir,
  searchQuery,
  amountMin,
  amountMax,
  windowLabels,
  onToggleFilters,
  onPresetChange,
  onSortFieldChange,
  onSortDirChange,
  onSearchQueryChange,
  onAmountMinChange,
  onAmountMaxChange,
  onResetFilters,
}: TransactionFiltersProps) {
  const presetChips = [
    { key: 'due-now' as TransactionPreset, label: windowLabels?.dueNowLabel ?? 'Vence agora', tooltip: 'Pagamentos pendentes com vencimento antes do próximo recebimento' },
    { key: 'current-window' as TransactionPreset, label: windowLabels?.currentWindowLabel ?? 'Período atual', tooltip: 'Tudo que vence no período atual' },
    { key: 'next-window' as TransactionPreset, label: windowLabels?.nextWindowLabel ?? 'Próximo período', tooltip: 'Só o que cai no próximo período' },
    { key: 'all-recurring' as TransactionPreset, label: 'Todas recorrentes', tooltip: 'Todas as contas recorrentes e assinaturas agendadas' },
    { key: 'one-time-only' as TransactionPreset, label: 'Só avulsas', tooltip: 'Gastos avulsos, incluindo pagamentos avulsos pendentes' },
  ]

  return (
    <>
      <div className="flex w-full sm:w-auto gap-2">
        <Button
          onClick={onToggleFilters}
          variant={showFilters || hasActiveFilters ? 'secondary' : 'outline'}
          size="sm"
          className="flex-1 sm:flex-none"
        >
          <Filter size={16} />
          Filtros
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {[preset !== null, !!searchQuery, !!(amountMin || amountMax)].filter(Boolean).length}
            </span>
          )}
        </Button>
      </div>

      <EditSheet
        open={showFilters}
        onOpenChange={(open) => { if (showFilters && !open) onToggleFilters() }}
        title="Filtrar e ordenar"
        description="Escolha o que aparece na lista."
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Filtros rápidos</Label>
            <TooltipProvider>
              <div className="flex flex-wrap gap-1.5">
                {presetChips.map(p => (
                  <Tooltip key={p.key}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={preset === p.key ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => onPresetChange(preset === p.key ? null : p.key)}
                        className="text-xs h-8"
                      >
                        {p.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{p.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Search</Label>
            <Input
              placeholder="Buscar em títulos e descrições..."
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              className="h-9"
              data-filter-search
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Faixa de valor</Label>
            <div className="flex items-center gap-2">
              <Input placeholder="Mín." value={amountMin} onChange={e => onAmountMinChange(e.target.value)} className="h-9" />
              <span className="text-muted-foreground text-xs">–</span>
              <Input placeholder="Máx." value={amountMax} onChange={e => onAmountMaxChange(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ordenar por</Label>
              <Select
                value={sortField}
                onValueChange={v => onSortFieldChange(v as 'title' | 'date' | 'amount')}
              >
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Título</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="amount">Valor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ordem</Label>
              <Select value={sortDir} onValueChange={v => onSortDirChange(v as 'asc' | 'desc')}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">
                    <span className="inline-flex items-center gap-1"><ArrowUp size={12} /> Crescente</span>
                  </SelectItem>
                  <SelectItem value="desc">
                    <span className="inline-flex items-center gap-1"><ArrowDown size={12} /> Decrescente</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="self-start" onClick={onResetFilters}>
              <X size={14} />
              Limpar filtros
            </Button>
          )}
        </div>
      </EditSheet>
    </>
  )
}
