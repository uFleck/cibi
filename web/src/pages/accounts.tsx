import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Wallet, Edit2, Trash2 } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppModal } from '@/components/AppModal'
import { MobileActionButton } from '@/components/MobileActionButton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import { AccountForm } from '@/components/AccountForm'
import { AccountScheduleForm, type AccountScheduleFrequency } from '@/components/AccountScheduleForm'
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
import { MoneyValue } from '@/components/ui/money-value'

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
  const [balanceText, setBalanceText] = useState('0')
  const [scheduleModalAccountId, setScheduleModalAccountId] = useState<string | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    label: '',
    frequency: 'monthly' as AccountScheduleFrequency,
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
      setBalanceText('0')
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
      setBalanceText('0')
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
    setBalanceText(account.current_balance.toString())
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
    setBalanceText('0')
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
      amount: parseFloat(scheduleForm.amount.replace(',', '.')),
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
  const scheduleCurrency = accounts.find(a => a.id === scheduleModalAccountId)?.currency ?? 'BRL'

  const handleAccountNameChange = (value: string) => {
    setFormData({ ...formData, name: value })
    if (formErrors.name) setFormErrors({ ...formErrors, name: undefined })
  }

  const handleAccountBalanceParsedChange = (value: number | null) => {
    setFormData({
      ...formData,
      current_balance: value ?? 0,
    })
  }

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
        <Button onClick={handleCreateClick} size="sm" className="hidden sm:inline-flex">
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
            <SharedDebtList
              mode="auto"
              view="owner"
              items={accounts.map(account => ({
                id: account.id,
                title: account.name,
                subtitle: `${account.currency}${account.is_default ? ' · Default' : ''}`,
                amount: account.current_balance,
                currency: account.currency,
                status: {
                  label: account.is_default ? 'Default' : 'Active',
                  tone: account.is_default ? 'default' : 'secondary',
                },
                canConfirm: !account.is_default,
                canDelete: true,
                canOpen: true,
              }))}
              emptyTitle="No accounts yet"
              emptyHint="Create an account to get started"
              onConfirm={(id) => defaultMutation.mutate(id)}
              onDelete={(id) => setConfirmDelete(id)}
              onOpen={(id) => {
                const account = accounts.find(a => a.id === id)
                if (account) handleEditClick(account)
              }}
            />
          )}
        </div>
      </Skeleton>

      <AppModal
        open={isCreating || !!editingId}
        onOpenChange={(open) => !open && handleCancel()}
        title={editingId ? 'Edit Account' : 'New Account'}
        description={editingId ? 'Update account details.' : 'Create a new account.'}
      >
        <AccountForm
          formData={formData}
          formErrors={formErrors}
          balanceText={balanceText}
          isPending={isPending}
          editingId={editingId}
          currencies={CURRENCIES}
          onNameChange={handleAccountNameChange}
          onBalanceTextChange={setBalanceText}
          onBalanceParsedChange={handleAccountBalanceParsedChange}
          onCurrencyChange={value => setFormData({ ...formData, currency: value })}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </AppModal>

      <div className="h-24 sm:h-8" />

      <div className="sm:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-30">
        <Button onClick={handleCreateClick} className="h-12 shadow-lg rounded-full px-5">
          <Plus size={18} />
          New Account
        </Button>
      </div>

      <AppModal
        open={!!scheduleModalAccountId}
        onOpenChange={(open) => !open && closeScheduleModal()}
        title="Pay Schedules"
        description={scheduleModalAccountId ? accounts.find(a => a.id === scheduleModalAccountId)?.name : ''}
        contentClassName="max-h-[80vh] sm:max-w-[calc(100vw-2rem)] lg:max-w-4xl"
      >

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
            <>
              <div className="sm:hidden flex flex-col gap-2">
                {schedules.map((ps: PayScheduleResponse) => (
                  editingScheduleId === ps.id ? null : (
                    <div key={ps.id} className="border rounded-md p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{ps.label ?? ps.frequency}</div>
                          <div className="text-sm text-muted-foreground">
                            {ps.frequency} · {ps.anchor_date}
                            {ps.day_of_month ? ` · day ${ps.day_of_month}` : ''}
                            {ps.day_of_month_2 ? `/${ps.day_of_month_2}` : ''}
                          </div>
                        </div>
                        <MoneyValue
                          amount={ps.amount}
                          currency={scheduleCurrency}
                          showSign="always"
                          tone="positive"
                          className="font-semibold"
                        />
                      </div>
                      <div className="flex justify-end gap-2 mt-2">
                        <MobileActionButton onClick={() => startEditSchedule(ps)} icon={Edit2} label="Edit" variant="outline" />
                        <MobileActionButton onClick={() => handleDeleteSchedule(ps.id)} icon={Trash2} label="Delete" variant="outline" />
                      </div>
                    </div>
                  )
                ))}
              </div>

              <div className="hidden sm:block border rounded-md overflow-x-auto">
                <table className="min-w-full w-max text-sm">
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
                              {ps.day_of_month ? ` · day ${ps.day_of_month}` : ''}
                              {ps.day_of_month_2 ? `/${ps.day_of_month_2}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <MoneyValue
                              amount={ps.amount}
                              currency={scheduleCurrency}
                              showSign="always"
                              tone="positive"
                              className="font-medium"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    onClick={() => startEditSchedule(ps)}
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9"
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
                                    className="h-9 w-9"
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
            </>
          )}

          {(editingScheduleId || schedules.length === 0 || !editingScheduleId) && (
            <AccountScheduleForm
              editingScheduleId={editingScheduleId}
              scheduleForm={scheduleForm}
              scheduleFormErrors={scheduleFormErrors}
              isPending={createScheduleMutation.isPending || updateScheduleMutation.isPending}
              onSubmit={handleScheduleSubmit}
              onChange={changes => setScheduleForm({ ...scheduleForm, ...changes })}
              onClearError={field => setScheduleFormErrors({ ...scheduleFormErrors, [field]: undefined })}
              onCancelEdit={discardScheduleForm}
            />
          )}
      </AppModal>
    </div>
  )
}
