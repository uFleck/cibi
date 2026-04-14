import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, Check, Wallet } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  type AccountResponse,
} from '@/lib/api'

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

  const {
    data: accounts = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
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
            accounts.map(account => (
              <Card key={account.id}>
                <CardContent className="py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.currency}
                        {account.is_default && ' • Default'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {account.current_balance.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      {!account.is_default && (
                        <Button
                          onClick={() => defaultMutation.mutate(account.id)}
                          variant="ghost"
                          size="sm"
                          aria-label="Set as default account"
                        >
                          <Check size={14} />
                        </Button>
                      )}
                      <Button
                        onClick={() => handleEditClick(account)}
                        variant="ghost"
                        size="sm"
                        aria-label="Edit account"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        onClick={() => setConfirmDelete(account.id)}
                        variant="ghost"
                        size="sm"
                        aria-label="Delete account"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </Skeleton>

      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? 'Edit Account' : 'New Account'}
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      <div className="h-8" />
    </div>
  )
}
