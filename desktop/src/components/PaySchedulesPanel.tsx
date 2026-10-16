import { useState } from 'react'
import { Check, Edit2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DataList } from '@/components/ui/data-list'
import { MoneyValue } from '@/components/ui/money-value'
import { EditSheet } from '@/components/EditSheet'
import { AccountScheduleForm, type AccountScheduleValues } from '@/components/AccountScheduleForm'
import { usePayScheduleMutations } from '@/hooks/usePayScheduleMutations'
import { formatDate } from '@/lib/format'
import { ROW_KEYS } from '@/lib/row-actions'
import type { CreatePayScheduleRequest, PayScheduleResponse } from '@/lib/api'

const EMPTY_FORM: AccountScheduleValues = {
  label: '',
  frequency: 'monthly',
  anchor_date: '',
  amount: '',
  day_of_month_2: '',
}

interface PaySchedulesPanelProps {
  accountId: string
  currency: string
  schedules: PayScheduleResponse[]
  /** The "new schedule" sheet. The page owns it so the `n` shortcut can open it. */
  creating: boolean
  onCreatingChange: (creating: boolean) => void
}

/** Pay schedules as recurring income: listed, edited in a sheet, marked received, deleted. */
export function PaySchedulesPanel({ accountId, currency, schedules, creating, onCreatingChange }: PaySchedulesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [form, setForm] = useState<AccountScheduleValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  const closeSheet = () => {
    setEditingId(null)
    onCreatingChange(false)
    setForm(EMPTY_FORM)
    setErrors({})
  }
  const { create, update, remove, confirm } = usePayScheduleMutations(closeSheet)

  const startCreate = () => {
    setForm(EMPTY_FORM)
    setErrors({})
    onCreatingChange(true)
  }

  const startEdit = (ps: PayScheduleResponse) => {
    setEditingId(ps.id)
    setErrors({})
    setForm({
      label: ps.label ?? '',
      frequency: ps.frequency,
      anchor_date: ps.anchor_date,
      amount: ps.amount.toFixed(2),
      day_of_month_2: ps.day_of_month_2 != null ? String(ps.day_of_month_2) : '',
    })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!form.anchor_date) found.anchor_date = 'Anchor date is required'
    if (!form.amount) found.amount = 'Amount is required'
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    const payload: CreatePayScheduleRequest = {
      account_id: accountId,
      frequency: form.frequency,
      anchor_date: form.anchor_date,
      amount: parseFloat(form.amount.replace(',', '.')),
      ...(form.label ? { label: form.label } : {}),
      ...(form.day_of_month_2 ? { day_of_month_2: parseInt(form.day_of_month_2, 10) } : {}),
    }
    if (editingId) update.mutate({ id: editingId, data: payload })
    else create.mutate(payload)
  }

  const sorted = [...schedules].sort((a, b) => a.next_payday.localeCompare(b.next_payday))
  const scheduleToDelete = schedules.find(ps => ps.id === confirmDelete)

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
        title={`Delete "${scheduleToDelete?.label ?? scheduleToDelete?.frequency}"?`}
        description="Future paydays from this schedule are no longer expected. Income already received stays in the ledger."
      />

      <div className="flex justify-end">
        <Button size="sm" onClick={startCreate}>
          <Plus size={16} />
          New Schedule
        </Button>
      </div>

      <DataList
        aria-label="Pay schedules"
        rows={sorted}
        rowId={ps => ps.id}
        empty="No pay schedules yet. Add one so paydays show up as expected income."
        columns={[
          {
            id: 'schedule',
            header: 'Schedule',
            title: ps => ps.label ?? ps.frequency,
            cell: ps => (
              <>
                <div className="truncate font-medium">{ps.label ?? ps.frequency}</div>
                <div className="truncate text-[11px] text-faint">
                  {ps.frequency} · recurring income
                  {ps.day_of_month_2 ? ` · 2nd payday on day ${ps.day_of_month_2}` : ''}
                </div>
              </>
            ),
          },
          {
            id: 'next',
            header: 'Next payday',
            className: 'hidden w-[20%] sm:table-cell',
            cell: ps => <span className="font-mono">{formatDate(ps.next_payday)}</span>,
          },
          {
            id: 'amount',
            header: 'Amount',
            align: 'right',
            numeric: true,
            className: 'w-[28%]',
            cell: ps => <MoneyValue amount={ps.amount} currency={currency} showSign="always" tone="positive" />,
          },
        ]}
        actions={ps => [
          {
            id: 'confirm',
            label: 'Mark received',
            icon: Check,
            keys: ROW_KEYS.confirm,
            disabled: confirm.isPending,
            run: () => confirm.mutate(ps.id),
          },
          { id: 'edit', label: 'Edit', icon: Edit2, keys: ROW_KEYS.edit, primary: true, run: () => startEdit(ps) },
          {
            id: 'delete',
            label: 'Delete',
            icon: Trash2,
            keys: ROW_KEYS.delete,
            variant: 'destructive',
            run: () => setConfirmDelete(ps.id),
          },
        ]}
      />

      <EditSheet
        open={creating || !!editingId}
        onOpenChange={open => {
          if (!open) closeSheet()
        }}
        title={editingId ? 'Edit Schedule' : 'New Schedule'}
      >
        <AccountScheduleForm
          editingScheduleId={editingId}
          scheduleForm={form}
          scheduleFormErrors={errors}
          isPending={create.isPending || update.isPending}
          onSubmit={submit}
          onChange={changes => setForm(prev => ({ ...prev, ...changes }))}
          onClearError={field => setErrors(prev => ({ ...prev, [field]: undefined }))}
          onCancelEdit={closeSheet}
        />
      </EditSheet>
    </div>
  )
}
