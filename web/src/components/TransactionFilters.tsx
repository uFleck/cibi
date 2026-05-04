import { ArrowDown, ArrowUp, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type TransactionPreset =
  | 'due-now'
  | 'current-window'
  | 'next-window'
  | 'all-recurring'
  | 'one-time-only'

export interface TransactionFiltersProps {
  showFilters: boolean
  hasActiveFilters: boolean
  preset: TransactionPreset
  categories: string[]
  filterCategory: string
  sortField: 'description' | 'date' | 'amount'
  sortDir: 'asc' | 'desc'
  onToggleFilters: () => void
  onPresetChange: (value: TransactionPreset) => void
  onFilterCategoryChange: (value: string) => void
  onSortFieldChange: (value: 'description' | 'date' | 'amount') => void
  onSortDirChange: (value: 'asc' | 'desc') => void
  onResetFilters: () => void
}

export function TransactionFilters({
  showFilters,
  hasActiveFilters,
  preset,
  categories,
  filterCategory,
  sortField,
  sortDir,
  onToggleFilters,
  onPresetChange,
  onFilterCategoryChange,
  onSortFieldChange,
  onSortDirChange,
  onResetFilters,
}: TransactionFiltersProps) {
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
              {[filterCategory !== 'all', preset !== 'current-window'].filter(Boolean).length}
            </span>
          )}
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Sort By</Label>
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
              <Label className="text-xs">Direction</Label>
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
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Category</Label>
              <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Preset</Label>
              <Select value={preset} onValueChange={v => onPresetChange(v as TransactionPreset)}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due-now">Due now</SelectItem>
                  <SelectItem value="current-window">Current window</SelectItem>
                  <SelectItem value="next-window">Next window</SelectItem>
                  <SelectItem value="all-recurring">All recurring</SelectItem>
                  <SelectItem value="one-time-only">One-time only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={onResetFilters}>
                <X size={14} />
                Clear
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
