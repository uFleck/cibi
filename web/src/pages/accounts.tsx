import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Edit2, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  type AccountResponse,
} from '@/lib/api'

interface FormData {
  name: string
  current_balance: number
  currency: string
}

export function AccountsPage() {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    current_balance: 0,
    currency: 'USD',
  })

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
  }

  const handleEditClick = (account: AccountResponse) => {
    setEditingId(account.id)
    setFormData({
      name: account.name,
      current_balance: account.current_balance,
      currency: account.currency,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Account name is required')
      return
    }

    if (!formData.currency.trim()) {
      toast.error('Currency is required')
      return
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, updates: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    setFormData({ name: '', current_balance: 0, currency: 'USD' })
  }

  if (isError) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="border-b border-border/50 sticky top-0 z-10 backdrop-blur-sm bg-background/80">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
            <a
              href="/"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </a>
            <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
              CIBI
            </span>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-center text-destructive">
            Failed to load accounts. Please try again.
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/50 sticky top-0 z-10 backdrop-blur-sm bg-background/80">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </a>
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
            CIBI
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Accounts</h1>
          <Button onClick={handleCreateClick} size="sm">
            <Plus size={16} />
            New Account
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 rounded-xl bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8 text-muted-foreground">
                  No accounts yet. Create one to get started.
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
                          {(account.current_balance / 100).toFixed(2)}
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        {!account.is_default && (
                          <Button
                            onClick={() => defaultMutation.mutate(account.id)}
                            variant="ghost"
                            size="sm"
                            title="Set as default"
                          >
                            <Check size={14} />
                          </Button>
                        )}
                        <Button
                          onClick={() => handleEditClick(account)}
                          variant="ghost"
                          size="sm"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          onClick={() => {
                            if (window.confirm(`Delete "${account.name}"?`)) {
                              deleteMutation.mutate(account.id)
                            }
                          }}
                          variant="ghost"
                          size="sm"
                          title="Delete"
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
        )}

        {(isCreating || editingId) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editingId ? 'Edit Account' : 'New Account'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-2">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Account name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-2">Current Balance</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.current_balance / 100}
                    onChange={e =>
                      setFormData({ ...formData, current_balance: Math.round(parseFloat(e.target.value) * 100) })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-2">Currency *</label>
                  <Input
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    placeholder="USD"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="submit" size="sm">
                    {editingId ? 'Update' : 'Create'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="h-8" />
      </main>
    </div>
  )
}
