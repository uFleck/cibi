import { useContext, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { Pencil, Plus, Power, Trash2, Wallet } from 'lucide-react'
import { AppModal } from '@/components/AppModal'
import { AccountForm, type AccountFormErrors, type AccountFormValues } from '@/components/AccountForm'
import { PaySchedulesPanel } from '@/components/PaySchedulesPanel'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { MoneyValue } from '@/components/ui/money-value'
import { Switch } from '@/components/ui/switch'
import { usePlan } from '@/hooks/usePlan'
import { createAccount, deleteAccount, updateAccount, type AccountResponse } from '@/lib/api'
import { AccountContext, ThemeContext } from '@/shell/contexts'

const PAGE = 'mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6'
const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'INR', 'SGD', 'HKD']

const EMPTY_FORM: AccountFormValues = { name: '', current_balance: 0, currency: 'BRL' }

export function SettingsPage() {
  const plan = usePlan()
  const queryClient = useQueryClient()
  const { theme, setTheme } = useContext(ThemeContext)
  const { setSelectedAccountId } = useContext(AccountContext)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AccountResponse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AccountResponse | null>(null)
  const [scheduleCreating, setScheduleCreating] = useState(false)
  const [form, setForm] = useState<AccountFormValues>(EMPTY_FORM)
  const [balanceText, setBalanceText] = useState('0')
  const [errors, setErrors] = useState<AccountFormErrors>({})

  const [autostartAvailable, setAutostartAvailable] = useState<boolean | null>(null)
  const [autostartEnabled, setAutostartEnabled] = useState(false)
  const [autostartPending, setAutostartPending] = useState(false)

  useEffect(() => {
    let alive = true
    isEnabled()
      .then(enabled => {
        if (!alive) return
        setAutostartEnabled(enabled)
        setAutostartAvailable(true)
      })
      .catch(() => {
        if (alive) setAutostartAvailable(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setBalanceText('0')
    setErrors({})
  }

  const saveAccount = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) {
        setErrors({ name: 'O nome é obrigatório' })
        throw new Error('O nome é obrigatório')
      }
      if (editing) {
        await updateAccount(editing.id, { name: form.name.trim() })
        return
      }
      await createAccount({
        name: form.name.trim(),
        current_balance: form.current_balance,
        currency: form.currency,
      })
    },
    onSuccess: () => {
      toast.success(editing ? 'Conta atualizada' : 'Conta criada')
      closeForm()
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para salvar a conta'),
  })

  const removeAccount = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => {
      toast.success('Conta excluída')
      setDeleteTarget(null)
      setSelectedAccountId(null)
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para excluir a conta'),
  })

  async function toggleAutostart(next: boolean) {
    setAutostartPending(true)
    try {
      if (next) await enable()
      else await disable()
      setAutostartEnabled(next)
      toast.success(next ? 'Abre ao entrar no Windows' : 'Não abre mais sozinho')
    } catch {
      toast.error('Não deu para mudar essa opção')
    } finally {
      setAutostartPending(false)
    }
  }

  return (
    <div className={PAGE}>
      <AppModal
        open={creating || editing !== null}
        onOpenChange={open => { if (!open) closeForm() }}
        title={editing ? 'Editar conta' : 'Nova conta'}
        description="A moeda e o saldo inicial valem na criação. Depois, ajuste o saldo na tela do plano."
      >
        <AccountForm
          formData={form}
          formErrors={errors}
          balanceText={balanceText}
          isPending={saveAccount.isPending}
          editingId={editing?.id ?? null}
          currencies={editing ? [editing.currency] : CURRENCIES}
          onNameChange={value => {
            setForm(prev => ({ ...prev, name: value }))
            if (errors.name) setErrors(prev => ({ ...prev, name: undefined }))
          }}
          onBalanceTextChange={setBalanceText}
          onBalanceParsedChange={value => setForm(prev => ({ ...prev, current_balance: value ?? 0 }))}
          onCurrencyChange={value => setForm(prev => ({ ...prev, currency: value }))}
          onSubmit={event => {
            event.preventDefault()
            saveAccount.mutate()
          }}
          onCancel={closeForm}
        />
      </AppModal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) removeAccount.mutate(deleteTarget.id)
        }}
        title={`Excluir "${deleteTarget?.name ?? ''}"?`}
        description="Isto apaga a conta e tudo que está nela: extrato, contas, recebimentos e dívidas desta conta. Não dá para desfazer."
        confirmLabel="Excluir tudo"
      />

      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint">Ajustes</p>
        <h1 className="text-xl font-semibold tracking-tight">O básico</h1>
        <p className="text-[12px] text-muted-foreground">Conta, recebimentos, tema e início com o Windows.</p>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Contas</h2>
            <p className="text-xs text-muted-foreground">O saldo é ajustado no plano, quando você quiser.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setCreating(true); setForm(EMPTY_FORM); setBalanceText('0') }}>
            <Plus size={14} />
            Nova conta
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col py-1">
            {plan.accounts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Wallet size={24} className="text-faint" />
                <p className="text-sm text-muted-foreground">Nenhuma conta ainda.</p>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus size={14} />
                  Criar primeira conta
                </Button>
              </div>
            ) : (
              plan.accounts.map(account => (
                <div key={account.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 py-2.5 last:border-b-0">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{account.name}</span>
                    <span className="text-[11px] text-muted-foreground">{account.currency}</span>
                  </div>
                  <MoneyValue amount={account.current_balance} currency={account.currency} tone="neutral" showSign="auto" className="text-sm font-semibold" />
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setEditing(account)
                      setForm({ name: account.name, current_balance: account.current_balance, currency: account.currency })
                      setBalanceText(account.current_balance.toFixed(2))
                    }}
                  >
                    <Pencil size={12} />
                    Editar
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Excluir conta" onClick={() => setDeleteTarget(account)}>
                    <Trash2 size={13} className="text-neg" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Recebimentos</h2>
            <p className="text-xs text-muted-foreground">Quando o dinheiro entra. O plano usa esta data.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setScheduleCreating(true)} disabled={!plan.account}>
            <Plus size={14} />
            Novo recebimento
          </Button>
        </div>
        {plan.account ? (
          <PaySchedulesPanel
            accountId={plan.account.id}
            currency={plan.account.currency}
            schedules={plan.schedules}
            creating={scheduleCreating}
            onCreatingChange={setScheduleCreating}
          />
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">Crie uma conta primeiro.</CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Aparência</h2>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm text-muted-foreground">Tema</span>
            <div className="flex gap-1.5">
              {(['dark', 'light'] as const).map(mode => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={theme === mode ? 'default' : 'outline'}
                  aria-pressed={theme === mode}
                  onClick={() => setTheme(mode)}
                >
                  {mode === 'dark' ? 'Escuro' : 'Claro'}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Windows</h2>
        <Card>
          <CardContent className="flex flex-col gap-2 py-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="start-at-login" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Power size={14} />
                Abrir ao entrar no Windows
              </Label>
              <Switch
                id="start-at-login"
                checked={autostartEnabled}
                disabled={autostartAvailable !== true || autostartPending}
                onCheckedChange={next => void toggleAutostart(next)}
              />
            </div>
            {autostartAvailable === false ? (
              <p className="text-[11px] text-faint">Não está disponível aqui.</p>
            ) : (
              <p className="text-[11px] text-faint">O cibi abre escondido, na bandeja.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
