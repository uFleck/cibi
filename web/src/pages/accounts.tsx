import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, Check, Wallet, DollarSign } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  listPaySchedules,
  createPaySchedule,
  updatePaySchedule,
  deletePaySchedule,
  type AccountResponse,
  type PayScheduleResponse,
  type CreatePayScheduleRequest,
} from '@/lib/api'
import { formatMoney } from '@/lib/format'

const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'INR', 'SGD', 'HKD',
]

interface FormData {
  name: string
  current_balance: number
  currency: string
}

type FormErrors = Partial<Record<keyof FormData, string>>

export function AccountsPage() {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    current_balance: 0,
    currency: 'BRL',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [scheduleModalAccountId, setScheduleModalAccountId] = useState<string | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    label: '',
    frequency: 'monthly' as 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly',
    anchor_date: '',
    amount: '',
    day_of_month: '',
    day_of_month_2: '',
  })
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [scheduleFormErrors, setScheduleFormErrors] = useState<Partial<Record<string, string>>>({})

  const {
    data: accounts = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const {
    data: schedules = [],
    isLoading: schedulesLoading,
  } = useQuery({
    queryKey: ['pay-schedules', scheduleModalAccountId],
    queryFn: () => listPaySchedules(scheduleModalAccountId!),
    enabled: !!scheduleModalAccountId,
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account created')
      setIsCreating(false)
      setFormData({ name: '', current_balance: 0, currency: 'USD' })
      setFormErrors({})
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create account')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<FormData> }) =>
      updateAccount(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account updated')
      setEditingId(null)
      setFormData({ name: '', current_balance: 0, currency: 'USD' })
      setFormErrors({})
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update account')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete account')
    },
  })

  const defaultMutation = useMutation({
    mutationFn: setDefaultAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Default account updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to set default account')
    },
  })

  const createScheduleMutation = useMutation({
    mutationFn: createPaySchedule,
    onSuccess: () => {
      toast.success('Schedule added')
      queryClient.invalidateQueries({ queryKey: ['pay-schedules', scheduleModalAccountId] })
      setScheduleForm({
        label: '',
        frequency: 'monthly',
        anchor_date: '',
        amount: '',
        day_of_month: '',
        day_of_month_2: '',
      })
      setScheduleFormErrors({})
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add schedule')
    },
  })

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePayScheduleRequest> }) =>
      updatePaySchedule(id, data),
    onSuccess: () => {
      toast.success('Schedule updated')
      queryClient.invalidateQueries({ queryKey: ['pay-schedules', scheduleModalAccountId] })
      setEditingScheduleId(null)
      setScheduleForm({
        label: '',
        frequency: 'monthly',
        anchor_date: '',
        amount: '',
        day_of_month: '',
        day_of_month_2: '',
      })
      setScheduleFormErrors({})
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update schedule')
    },
  })

  const deleteScheduleMutation = useMutation({
    mutationFn: deletePaySchedule,
    onSuccess: () => {
      toast.success('Schedule deleted')
      queryClient.invalidateQueries({ queryKey: ['pay-schedules', scheduleModalAccountId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete schedule')
    },
  })

  const handleCreateClick = () => {
    setIsCreating(true)
    setEditingId(null)
    setFormErrors({})
  }

  const handleEditClick = (account: AccountResponse) => {
    setEditingId(account.id)
    setFormErrors({})
    setFormData({
      name: account.name,
      current_balance: account.current_balance,
      currency: account.currency,
    })
  }

  const validate = (): boolean => {
    const errors: FormErrors = {}
    if (!formData.name.trim()) errors.name = 'Name is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (editingId) {
      updateMutation.mutate({ id: editingId, updates: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    setFormErrors({})
    setFormData({ name: '', current_balance: 0, currency: 'USD' })
  }

  const openScheduleModal = (accountId: string) => {
    setScheduleModalAccountId(accountId)
    setEditingScheduleId(null)
    setScheduleForm({
      label: '',
      frequency: 'monthly',
      anchor_date: '',
      amount: '',
      day_of_month: '',
      day_of_month_2: '',
    })
    setScheduleFormErrors({})
  }

  const closeScheduleModal = () => {
    setScheduleModalAccountId(null)
    setEditingScheduleId(null)
  }

  const startEditSchedule = (ps: PayScheduleResponse) => {
    setEditingScheduleId(ps.id)
    setScheduleForm({
      label: ps.label ?? '',
      frequency: ps.frequency,
      anchor_date: ps.anchor_date,
      amount: ps.amount.toFixed(2),
      day_of_month: ps.day_of_month != null ? String(ps.day_of_month) : '',
      day_of_month_2: ps.day_of_month_2 != null ? String(ps.day_of_month_2) : '',
    })
    setScheduleFormErrors({})
  }

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!scheduleModalAccountId) return

    const errors: Record<string, string> = {}
    if (!scheduleForm.anchor_date) errors.anchor_date = 'Anchor date is required'
    if (!scheduleForm.amount) errors.amount = 'Amount is required'
    if (Object.keys(errors).length > 0) {
      setScheduleFormErrors(errors)
      return
    }

    const payload: CreatePayScheduleRequest = {
      account_id: scheduleModalAccountId,
      frequency: scheduleForm.frequency,
      anchor_date: scheduleForm.anchor_date,
      amount: parseFloat(scheduleForm.amount),
      ...(scheduleForm.label ? { label: scheduleForm.label } : {}),
      ...(scheduleForm.day_of_month ? { day_of_month: parseInt(scheduleForm.day_of_month, 10) } : {}),
      ...(scheduleForm.day_of_month_2 ? { day_of_month_2: parseInt(scheduleForm.day_of_month_2, 10) } : {}),
    }

    if (editingScheduleId) {
      updateScheduleMutation.mutate({ id: editingScheduleId, data: payload })
    } else {
      createScheduleMutation.mutate(payload)
    }
  }

  const handleDeleteSchedule = (id: string) => {
    deleteScheduleMutation.mutate(id)
  }

  const discardScheduleForm = () => {
    setEditingScheduleId(null)
    setScheduleForm({
      label: '',
      frequency: 'monthly',
      anchor_date: '',
      amount: '',
      day_of_month: '',
      day_of_month_2: '',
    })
    setScheduleFormErrors({})
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const accountToDelete = accounts.find(a => a.id === confirmDelete)

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center text-destructive">
          Failed to load accounts. Please try again.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
        title={`Delete "${accountToDelete?.name}"?`}
        description="This action cannot be undone."
      />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <Button onClick={handleCreateClick} size="sm">
          <Plus size={16} />
          New Account
        </Button>
      </div>

      <Skeleton
        name="account-list"
        loading={isLoading}
        fallback={
          <div className="space-y-3" role="status" aria-label="Loading accounts">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 rounded-xl bg-card/60 animate-pulse border border-border/40" />
            ))}
            <span className="sr-only">Loading...</span>
          </div>
        }
      >
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Wallet className="mx-auto mb-4 text-muted-foreground/40" size={40} />
                <p className="text-muted-foreground mb-4">No accounts yet</p>
                <Button onClick={handleCreateClick} size="sm">
                  <Plus size={16} />
                  Create First Account
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Account</th>
                    <th className="text-right px-3 py-2 font-medium">Balance</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {accounts.map(account => (
                    <tr key={account.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium truncate">{account.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {account.currency}
                          {account.is_default && ' · Default'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {account.current_balance.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => openScheduleModal(account.id)}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Manage pay schedules"
                              >
                                <DollarSign size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Pay schedules</p>
                            </TooltipContent>
                          </Tooltip>
                          {!account.is_default && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => defaultMutation.mutate(account.id)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label="Set as default"
                                >
                                  <Check size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Set as default</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => handleEditClick(account)}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Edit account"
                              >
                                <Edit2 size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Edit account</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => setConfirmDelete(account.id)}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Delete account"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete account</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Skeleton>

      <Dialog open={isCreating || !!editingId} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Account' : 'New Account'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update account details.' : 'Create a new account.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-name" className="text-xs">Name *</Label>
              <Input
                id="account-name"
                value={formData.name}
                onChange={e => {
                  setFormData({ ...formData, name: e.target.value })
                  if (formErrors.name) setFormErrors({ ...formErrors, name: undefined })
                }}
                placeholder="Account name"
                autoFocus
                aria-invalid={!!formErrors.name || undefined}
                aria-describedby={formErrors.name ? 'account-name-error' : undefined}
              />
              {formErrors.name && (
                <p id="account-name-error" className="text-xs text-destructive">
                  {formErrors.name}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-balance" className="text-xs">Current Balance</Label>
                <Input
                  id="account-balance"
                  type="number"
                  step="0.01"
                  value={formData.current_balance}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      current_balance: parseFloat(e.target.value),
                    })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-currency" className="text-xs">Currency *</Label>
                <Select
                  value={formData.currency}
                  onValueChange={v => setFormData({ ...formData, currency: v })}
                >
                  <SelectTrigger id="account-currency" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending
                  ? editingId
                    ? 'Updating...'
                    : 'Creating...'
                  : editingId
                    ? 'Update'
                    : 'Create'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="h-8" />

      <Dialog open={!!scheduleModalAccountId} onOpenChange={(open) => !open && closeScheduleModal()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Pay Schedules
            </DialogTitle>
            <DialogDescription>
              {scheduleModalAccountId ? accounts.find(a => a.id === scheduleModalAccountId)?.name : ''}
            </DialogDescription>
          </DialogHeader>

          {schedulesLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
              ))}
            </div>
          ) : schedules.length === 0 && !editingScheduleId ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No pay schedules yet</p>
              <p className="text-xs text-muted-foreground">Add a schedule to tell CIBI when you get paid.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Schedule</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {schedules.map((ps: PayScheduleResponse) => (
                    editingScheduleId === ps.id ? null : (
                      <tr key={ps.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="font-medium">{ps.label ?? ps.frequency}</div>
                          <div className="text-xs text-muted-foreground">
                            {ps.frequency} · {ps.anchor_date}
                            {ps.day_of_month_2 ? ` · day ${ps.day_of_month_2}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-green-600">
                          +{formatMoney(ps.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => startEditSchedule(ps)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label="Edit schedule"
                                >
                                  <Edit2 size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit schedule</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => handleDeleteSchedule(ps.id)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label="Delete schedule"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete schedule</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(editingScheduleId || schedules.length === 0 || !editingScheduleId) && (
            <form onSubmit={handleScheduleSubmit} className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-4">
                {editingScheduleId ? 'Edit Schedule' : 'Add Schedule'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-label" className="text-xs">Label</Label>
                  <Input
                    id="schedule-label"
                    placeholder="e.g. Main paycheck"
                    value={scheduleForm.label}
                    onChange={e => setScheduleForm({ ...scheduleForm, label: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-frequency" className="text-xs">Frequency</Label>
                  <Select
                    value={scheduleForm.frequency}
                    onValueChange={v => setScheduleForm({ ...scheduleForm, frequency: v as typeof scheduleForm.frequency })}
                  >
                    <SelectTrigger id="schedule-frequency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                      <SelectItem value="semi-monthly">Semi-monthly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-anchor" className="text-xs">Anchor Date *</Label>
                  <Input
                    id="schedule-anchor"
                    type="date"
                    value={scheduleForm.anchor_date}
                    onChange={e => {
                      setScheduleForm({ ...scheduleForm, anchor_date: e.target.value })
                      if (scheduleFormErrors.anchor_date) setScheduleFormErrors({ ...scheduleFormErrors, anchor_date: undefined })
                    }}
                  />
                  {scheduleFormErrors.anchor_date && (
                    <p className="text-xs text-destructive">{scheduleFormErrors.anchor_date}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-amount" className="text-xs">Amount ($) *</Label>
                  <Input
                    id="schedule-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={scheduleForm.amount}
                    onChange={e => {
                      setScheduleForm({ ...scheduleForm, amount: e.target.value })
                      if (scheduleFormErrors.amount) setScheduleFormErrors({ ...scheduleFormErrors, amount: undefined })
                    }}
                  />
                  {scheduleFormErrors.amount && (
                    <p className="text-xs text-destructive">{scheduleFormErrors.amount}</p>
                  )}
                </div>
                {(scheduleForm.frequency === 'monthly' || scheduleForm.frequency === 'semi-monthly') && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="schedule-day" className="text-xs">Day of Month</Label>
                    <Input
                      id="schedule-day"
                      type="number"
                      min="1"
                      max="31"
                      value={scheduleForm.day_of_month}
                      onChange={e => setScheduleForm({ ...scheduleForm, day_of_month: e.target.value })}
                    />
                  </div>
                )}
                {scheduleForm.frequency === 'semi-monthly' && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="schedule-day2" className="text-xs">Day of Month 2</Label>
                    <Input
                      id="schedule-day2"
                      type="number"
                      min="1"
                      max="31"
                      value={scheduleForm.day_of_month_2}
                      onChange={e => setScheduleForm({ ...scheduleForm, day_of_month_2: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button type="submit" size="sm" disabled={createScheduleMutation.isPending || updateScheduleMutation.isPending}>
                  {editingScheduleId ? 'Update Schedule' : 'Add Schedule'}
                </Button>
                {editingScheduleId && (
                  <Button type="button" variant="outline" size="sm" onClick={discardScheduleForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
