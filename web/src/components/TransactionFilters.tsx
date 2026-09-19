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
  sortField: 'description' | 'date' | 'amount'
  sortDir: 'asc' | 'desc'
  searchQuery: string
  amountMin: string
  amountMax: string
  windowLabels: WindowLabels | null
  onToggleFilters: () => void
  onPresetChange: (value: TransactionPreset | null) => void
  onSortFieldChange: (value: 'description' | 'date' | 'amount') => void
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
    { key: 'due-now' as TransactionPreset, label: windowLabels?.dueNowLabel ?? 'Due now', tooltip: 'Pending payments with a date before your next payday' },
    { key: 'current-window' as TransactionPreset, label: windowLabels?.currentWindowLabel ?? 'Current window', tooltip: 'Everything due in the current pay period' },
    { key: 'next-window' as TransactionPreset, label: windowLabels?.nextWindowLabel ?? 'Next window', tooltip: 'Only items falling in the next pay period' },
    { key: 'all-recurring' as TransactionPreset, label: 'All recurring', tooltip: 'All scheduled repeating bills and subscriptions' },
    { key: 'one-time-only' as TransactionPreset, label: 'One-time only', tooltip: 'Ad-hoc transactions, including pending one-time payments' },
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
          Filters
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
        title="Filter & Sort"
        description="Narrow down which transactions you see."
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Quick filters</Label>
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
              placeholder="Search descriptions..."
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              className="h-9"
              data-filter-search
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount range</Label>
            <div className="flex items-center gap-2">
              <Input placeholder="Min" value={amountMin} onChange={e => onAmountMinChange(e.target.value)} className="h-9" />
              <span className="text-muted-foreground text-xs">–</span>
              <Input placeholder="Max" value={amountMax} onChange={e => onAmountMaxChange(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sort by</Label>
              <Select
                value={sortField}
                onValueChange={v => onSortFieldChange(v as 'description' | 'date' | 'amount')}
              >
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="date">When</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Direction</Label>
              <Select value={sortDir} onValueChange={v => onSortDirChange(v as 'asc' | 'desc')}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">
                    <span className="inline-flex items-center gap-1"><ArrowUp size={12} /> Asc</span>
                  </SelectItem>
                  <SelectItem value="desc">
                    <span className="inline-flex items-center gap-1"><ArrowDown size={12} /> Desc</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="self-start" onClick={onResetFilters}>
              <X size={14} />
              Clear all filters
            </Button>
          )}
        </div>
      </EditSheet>
    </>
  )
}
