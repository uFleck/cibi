import { useState, useContext } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AccountSelector } from '@/components/AccountSelector'
import {
  fetchAccounts,
  listPaySchedules,
  createPaySchedule,
  updatePaySchedule,
  deletePaySchedule,
  type PayScheduleResponse,
  type CreatePayScheduleRequest,
} from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { AccountContext } from '@/App'

interface FormState {
  label: string
  frequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
  anchor_date: string
  amount: string
  day_of_month: string
  day_of_month_2: string
}

const EMPTY_FORM: FormState = {
  label: '',
  frequency: 'monthly',
  anchor_date: '',
  amount: '',
  day_of_month: '',
  day_of_month_2: '',
}

export function Settings() {
  const queryClient = useQueryClient()
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const currentAccountId = selectedAccountId || accounts[0]?.id || null
  const accountName = accounts.find(a => a.id === currentAccountId)?.name ?? ''

  const {
    data: schedules = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['pay-schedules', currentAccountId],
    queryFn: () => listPaySchedules(currentAccountId!),
    enabled: !!currentAccountId,
  })

  const createMutation = useMutation({
    mutationFn: createPaySchedule,
    onSuccess: () => {
      toast.success('Schedule added')
      queryClient.invalidateQueries({ queryKey: ['pay-schedules', currentAccountId] })
      setIsCreating(false)
      setForm(EMPTY_FORM)
    },
    onError: () => toast.error('Failed to add schedule'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePayScheduleRequest> }) =>
      updatePaySchedule(id, data),
    onSuccess: () => {
      toast.success('Schedule updated')
      queryClient.invalidateQueries({ queryKey: ['pay-schedules', currentAccountId] })
      setEditingId(null)
      setForm(EMPTY_FORM)
    },
    onError: () => toast.error('Failed to update schedule'),
  })

  const deleteMutation = useMutation({
    mutationFn: deletePaySchedule,
    onSuccess: () => {
      toast.success('Schedule deleted')
      queryClient.invalidateQueries({ queryKey: ['pay-schedules', currentAccountId] })
    },
    onError: () => toast.error('Failed to delete schedule'),
  })

  function handleDelete(id: string) {
    if (!window.confirm('Delete this schedule?')) return
    deleteMutation.mutate(id)
  }

  function startEdit(ps: PayScheduleResponse) {
    setEditingId(ps.id)
    setIsCreating(false)
    setForm({
      label: ps.label ?? '',
      frequency: ps.frequency,
      anchor_date: ps.anchor_date,
      amount: (ps.amount / 100).toFixed(2),
      day_of_month: ps.day_of_month != null ? String(ps.day_of_month) : '',
      day_of_month_2: ps.day_of_month_2 != null ? String(ps.day_of_month_2) : '',
    })
  }

  function handleDiscard() {
    setIsCreating(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentAccountId) return

    const payload: CreatePayScheduleRequest = {
      account_id: currentAccountId,
      frequency: form.frequency,
      anchor_date: form.anchor_date,
      amount: Math.round(parseFloat(form.amount) * 100),
      ...(form.label ? { label: form.label } : {}),
      ...(form.day_of_month ? { day_of_month: parseInt(form.day_of_month, 10) } : {}),
      ...(form.day_of_month_2 ? { day_of_month_2: parseInt(form.day_of_month_2, 10) } : {}),
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const formFreq = form.frequency

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Pay Schedules</h1>
          <p className="text-xs text-muted-foreground">Account: {accountName}</p>
        </div>
        <div className="flex items-center gap-2">
          <AccountSelector
            selectedAccountId={currentAccountId}
            onSelectAccount={setSelectedAccountId}
          />
          <Button size="sm" onClick={() => { setIsCreating(true); setEditingId(null); setForm(EMPTY_FORM) }}>
            <Plus size={16} /> Add Schedule
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-card/60 animate-pulse border border-border/40" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center text-destructive">
          Failed to load schedules. Refresh to try again.{' '}
          <button className="underline" onClick={() => refetch()}>Refresh</button>
        </div>
      )}

      {!isLoading && !isError && schedules.length === 0 && !isCreating && (
        <div className="text-center py-12">
          <p className="font-semibold">No pay schedules yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add a schedule to tell CIBI when you get paid.</p>
        </div>
      )}

      {!isLoading && !isError && schedules.map((ps: PayScheduleResponse) => (
        editingId === ps.id ? null : (
          <Card key={ps.id}>
            <CardContent className="py-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div>
                  <p className="font-semibold">{ps.label ?? ps.frequency}</p>
                  <p className="text-xs text-muted-foreground">
                    {ps.frequency} · {ps.anchor_date}
                    {ps.day_of_month_2 ? ` · day ${ps.day_of_month_2}` : ''}
                  </p>
                </div>
                <p className="font-semibold tabular-nums text-right text-green-600">
                  +{formatMoney(ps.amount / 100)}
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" aria-label="Edit schedule"
                    onClick={() => startEdit(ps)}>
                    <Edit2 size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Delete schedule"
                    onClick={() => handleDelete(ps.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      ))}

      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editingId ? 'Edit Schedule' : 'New Schedule'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold mb-2">Label</label>
                <Input
                  placeholder="e.g. Main paycheck"
                  value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2">Frequency</label>
                <select
                  className="w-full h-8 px-2 py-1 rounded-lg border border-input bg-transparent text-base md:text-sm"
                  value={form.frequency}
                  onChange={e => setForm({ ...form, frequency: e.target.value as FormState['frequency'] })}
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="semi-monthly">Semi-monthly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2">Anchor Date</label>
                <Input
                  type="date"
                  required
                  value={form.anchor_date}
                  onChange={e => setForm({ ...form, anchor_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2">Amount ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              {(formFreq === 'monthly' || formFreq === 'semi-monthly') && (
                <div>
                  <label className="block text-xs font-semibold mb-2">Day of Month</label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={form.day_of_month}
                    onChange={e => setForm({ ...form, day_of_month: e.target.value })}
                  />
                </div>
              )}
              {formFreq === 'semi-monthly' && (
                <div>
                  <label className="block text-xs font-semibold mb-2">Day of Month 2</label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={form.day_of_month_2}
                    onChange={e => setForm({ ...form, day_of_month_2: e.target.value })}
                  />
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={isPending}>
                  {editingId ? 'Update Schedule' : 'Create Schedule'}
                </Button>
                <Button type="button" variant="outline" onClick={handleDiscard}>
                  Discard
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="h-8" />
    </div>
  )
}
