import { useContext, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EditSheet } from '@/components/EditSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fetchAccounts, fetchBudget, saveBudgetLimits, type BudgetLimit, type BudgetResponse } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { AccountContext } from '@/shell/contexts'
import { useShellAction } from '@/shell/shellActions'
import { useBudgetMonth } from './useBudgetMonth'

const DEFAULT_CURRENCY = 'BRL'
const OPTIONS_ID = 'budget-category-options'

interface FormRow {
  key: number
  category: string
  /** Reais as typed. Blank means the row is not saved. */
  limit: string
  isFixed: boolean
}

interface RowCheck {
  /** False for a row with a blank limit: it is left out of the save. */
  included: boolean
  /** Cents for a valid limit; null when the limit is missing or invalid. */
  cents: number | null
  problem: string | null
}

/** Reais as typed: '1234,56', '1234.56', '1.234,56' or '1234'. Null when it is not an amount. */
function parseReais(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '')
  let normalized: string
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) normalized = text.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+(,\d{1,2})?$/.test(text)) normalized = text.replace(',', '.')
  else if (/^-?\d+(\.\d{1,2})?$/.test(text)) normalized = text
  else return null
  return Number(normalized)
}

function toFormRows(rows: BudgetResponse['rows']): FormRow[] {
  return rows.flatMap((row, key) => (row.limit === null
    ? []
    : [{ key, category: row.category, limit: (row.limit / 100).toFixed(2), isFixed: row.isFixed }]))
}

function checkRows(rows: FormRow[]): RowCheck[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const category = row.category.trim()
    if (category !== '' && row.limit.trim() !== '') counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return rows.map((row): RowCheck => {
    if (row.limit.trim() === '') return { included: false, cents: null, problem: null }
    const reais = parseReais(row.limit)
    if (reais === null) return { included: true, cents: null, problem: 'Enter an amount, such as 1234,56.' }
    if (reais < 0) return { included: true, cents: null, problem: 'The limit cannot be negative.' }
    const cents = Math.round(reais * 100)
    const category = row.category.trim()
    if (category === '') return { included: true, cents, problem: 'Enter a category.' }
    if ((counts.get(category) ?? 0) > 1) return { included: true, cents, problem: 'This category is already in the list.' }
    return { included: true, cents, problem: null }
  })
}

interface BudgetFormProps {
  data: BudgetResponse
  currency: string
  onSaved: () => void
}

function BudgetForm({ data, currency, onSaved }: BudgetFormProps) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<FormRow[]>(() => toFormRows(data.rows))
  const checks = checkRows(rows)
  const hasProblem = checks.some(check => check.problem !== null)
  const total = checks.reduce((sum, check) => sum + (check.cents ?? 0), 0)

  const save = useMutation({
    mutationFn: (limits: BudgetLimit[]) => saveBudgetLimits(limits),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budget'] })
      toast.success('Budget saved')
      onSaved()
    },
  })

  function updateRow(key: number, patch: Partial<Omit<FormRow, 'key'>>) {
    setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows(current => [...current, { key: (current.at(-1)?.key ?? -1) + 1, category: '', limit: '', isFixed: false }])
  }

  function removeRow(key: number) {
    setRows(current => current.filter(row => row.key !== key))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (hasProblem || save.isPending) return
    const limits: BudgetLimit[] = rows.flatMap((row, index) => {
      const check = checks[index]
      if (!check.included || check.cents === null) return []
      return [{ category: row.category.trim(), monthlyLimit: check.cents, isFixed: row.isFixed }]
    })
    save.mutate(limits)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <datalist id={OPTIONS_ID}>
        {data.categories.map(option => <option key={option.id} value={option.label} />)}
      </datalist>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No limits yet. Add a category to start tracking.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((row, index) => {
            const check = checks[index]
            const problemId = `budget-problem-${row.key}`
            const fixedId = `budget-fixed-${row.key}`
            return (
              <li key={row.key} className="flex flex-col gap-1.5 rounded-md border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Category"
                    list={OPTIONS_ID}
                    placeholder="Category"
                    value={row.category}
                    aria-invalid={check.problem !== null}
                    aria-describedby={check.problem ? problemId : undefined}
                    onChange={event => updateRow(row.key, { category: event.target.value })}
                  />
                  <Input
                    aria-label="Monthly limit"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={row.limit}
                    aria-invalid={check.problem !== null}
                    aria-describedby={check.problem ? problemId : undefined}
                    className="w-28 shrink-0 text-right tabular-nums"
                    onChange={event => updateRow(row.key, { limit: event.target.value })}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove category" onClick={() => removeRow(row.key)}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={fixedId}
                      size="sm"
                      checked={row.isFixed}
                      onCheckedChange={checked => updateRow(row.key, { isFixed: checked })}
                    />
                    <Label htmlFor={fixedId}>Fixed bill</Label>
                  </div>
                  {check.problem && (
                    <p id={problemId} role="alert" className="text-xs text-destructive">{check.problem}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus />
          Add category
        </Button>
        <p className="text-sm text-muted-foreground">
          Total <span className="font-semibold tabular-nums text-foreground">{formatMoney(total / 100, currency)}</span>
        </p>
      </div>

      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {save.error instanceof Error ? save.error.message : 'Could not save the budget.'}
        </p>
      )}

      <Button type="submit" disabled={hasProblem || save.isPending} className="w-full">
        Save
      </Button>
    </form>
  )
}

export function BudgetEditor() {
  const [open, setOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(0)
  const queryClient = useQueryClient()
  const month = useBudgetMonth()

  useShellAction('open-budget', () => {
    if (open) return
    // Marks the cached budget stale, so opening always fetches a fresh copy despite the default staleTime.
    void queryClient.invalidateQueries({ queryKey: ['budget'] })
    setOpenedAt(Date.now())
    setOpen(true)
  })

  const budget = useQuery({
    queryKey: ['budget', month],
    queryFn: () => fetchBudget(month),
    enabled: open,
  })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const { selectedAccountId } = useContext(AccountContext)
  const currentAccount = accounts.data?.find(account => account.id === selectedAccountId) ?? accounts.data?.[0]
  const currency = currentAccount?.currency ?? DEFAULT_CURRENCY

  // Only a response fetched since this open seeds the form, so a stale cached copy never does.
  const fresh = budget.data !== undefined && budget.dataUpdatedAt >= openedAt

  return (
    <EditSheet open={open} onOpenChange={setOpen} title="Monthly budget">
      {fresh && budget.data ? (
        <BudgetForm key={openedAt} data={budget.data} currency={currency} onSaved={() => setOpen(false)} />
      ) : budget.isError ? (
        <p role="alert" className="text-sm text-destructive">Could not load the budget.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}
    </EditSheet>
  )
}
