import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Wallet, Edit2, Trash2 } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { PageHeader, pageShell } from '@/components/ui/page-header'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DataList } from '@/components/ui/data-list'
import { ROW_KEYS } from '@/lib/row-actions'
import { AppModal } from '@/components/AppModal'
import { AccountForm } from '@/components/AccountForm'
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  type AccountResponse,
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

const EMPTY_FORM: FormData = { name: '', current_balance: 0, currency: 'BRL' }

export function AccountsPage() {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [balanceText, setBalanceText] = useState('0')

  const {
    data: accounts = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const resetForm = () => {
    setFormData(EMPTY_FORM)
    setBalanceText('0')
    setFormErrors({})
  }

  const createMutation = useMutation({
    mutationFn: (data: FormData) => createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta criada')
      setIsCreating(false)
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não deu para criar a conta')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<FormData> }) =>
      updateAccount(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta atualizada')
      setEditingId(null)
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não deu para atualizar a conta')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta excluída')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não deu para excluir a conta')
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
    if (!formData.name.trim()) errors.name = 'O nome é obrigatório'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (editingId) {
      // The balance is adjusted from the Balance card, never from here.
      updateMutation.mutate({ id: editingId, updates: { name: formData.name, currency: formData.currency } })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    resetForm()
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const accountToDelete = accounts.find(a => a.id === confirmDelete)

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
        <div className="text-center text-neg">
          Não deu para carregar as contas. Tente de novo.
        </div>
      </div>
    )
  }

  return (
    <div className={pageShell}>
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
        title={`Excluir "${accountToDelete?.name}" permanentemente?`}
        description="Isto exclui a conta e TODAS as suas transações, o extrato, os recebimentos, as metas (com seus aportes), os eventos em grupo e as dívidas. Amigos não são excluídos. Não dá para desfazer."
        confirmLabel="Excluir conta e todos os dados"
      />

      <PageHeader
        eyebrow="Contas"
        title="Contas"
        description="Gerencie suas contas. Ajuste um saldo pelo cartão Saldo no painel; os recebimentos ficam em Transações."
        actions={
          <Button onClick={handleCreateClick} size="sm" className="hidden sm:inline-flex">
            <Plus size={16} />
            Nova conta
          </Button>
        }
      />

      <Skeleton
        name="account-list"
        loading={isLoading}
        fallback={
          <div className="flex flex-col gap-1.5" role="status" aria-label="Carregando contas">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-8 rounded-md bg-surface-2 animate-pulse" />
            ))}
            <span className="sr-only">Carregando...</span>
          </div>
        }
      >
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="rounded-md border border-line bg-surface text-center py-12">
              <Wallet className="mx-auto mb-4 text-faint" size={40} />
              <p className="text-muted-foreground mb-4">Nenhuma conta ainda</p>
              <Button onClick={handleCreateClick} size="sm">
                <Plus size={16} />
                Criar primeira conta
              </Button>
            </div>
          ) : (
            <DataList
              aria-label="Contas"
              rows={accounts}
              rowId={account => account.id}
              columns={[
                { id: 'name', header: 'Nome', cell: account => <span className="font-medium">{account.name}</span> },
                {
                  id: 'currency',
                  header: 'Moeda',
                  className: 'hidden w-[12%] sm:table-cell',
                  cell: account => <span className="font-mono text-faint">{account.currency}</span>,
                },
                {
                  id: 'balance',
                  header: 'Saldo',
                  align: 'right',
                  numeric: true,
                  className: 'w-[28%]',
                  cell: account => (
                    <MoneyValue amount={account.current_balance} currency={account.currency} showSign="auto" tone="auto" />
                  ),
                },
              ]}
              actions={account => [
                {
                  id: 'edit',
                  label: 'Editar',
                  icon: Edit2,
                  keys: ROW_KEYS.edit,
                  primary: true,
                  run: () => handleEditClick(account),
                },
                {
                  id: 'delete',
                  label: 'Excluir',
                  icon: Trash2,
                  keys: ROW_KEYS.delete,
                  variant: 'destructive',
                  run: () => setConfirmDelete(account.id),
                },
              ]}
            />
          )}
        </div>
      </Skeleton>

      <AppModal
        open={isCreating || !!editingId}
        onOpenChange={(open) => !open && handleCancel()}
        title={editingId ? 'Editar conta' : 'Nova conta'}
        description={editingId ? 'Atualize os dados da conta.' : 'Criar uma nova conta.'}
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
          Nova conta
        </Button>
      </div>
    </div>
  )
}
