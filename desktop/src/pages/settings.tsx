import { useContext, useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, User, HandCoins, Palette, Power, Tags, type LucideIcon } from 'lucide-react'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { Button } from '@/components/ui/button'
import { PageHeader, pageShell } from '@/components/ui/page-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { backfillCategories, fetchAccounts, fetchProfile, updateAccount, updateProfile } from '@/lib/api'
import { activateLaya } from '@/lib/laya'
import { AccountContext, ThemeContext } from '@/App'

function SettingsPanel({ icon: Icon, title, description, children }: {
  icon?: LucideIcon
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="flex flex-col gap-0.5 border-b border-line px-3 py-2">
        <h2 className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint">
          {Icon && <Icon size={12} />}
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId } = useContext(AccountContext)
  const { theme, setTheme } = useContext(ThemeContext)

  const { data: profile } = useQuery({
    queryKey: ['profile', selectedAccountId],
    queryFn: () => fetchProfile(selectedAccountId as string),
    enabled: !!selectedAccountId,
  })
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })
  const selectedAccount = accounts.find(account => account.id === selectedAccountId) ?? null
  const { data: layaStatus } = useQuery({
    queryKey: ['classifier-status'],
    queryFn: activateLaya,
    staleTime: Infinity,
  })

  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [pixKeyDraft, setPixKeyDraft] = useState('')
  const [safetyBufferDraft, setSafetyBufferDraft] = useState('0')
  const [themeDraft, setThemeDraft] = useState('neutral-command')

  // null = not read yet, false = the autostart plugin is unavailable (browser or tests).
  const [autostartAvailable, setAutostartAvailable] = useState<boolean | null>(null)
  const [autostartEnabled, setAutostartEnabled] = useState(false)
  const [autostartPending, setAutostartPending] = useState(false)
  const [autostartError, setAutostartError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    isEnabled()
      .then((enabled) => {
        if (!active) return
        setAutostartEnabled(enabled)
        setAutostartAvailable(true)
      })
      .catch(() => {
        if (active) setAutostartAvailable(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function handleAutostartChange(next: boolean) {
    setAutostartPending(true)
    setAutostartError(null)
    try {
      if (next) await enable()
      else await disable()
      setAutostartEnabled(next)
      toast.success(next ? 'Iniciar ao fazer login ativado' : 'Iniciar ao fazer login desativado')
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setAutostartError(`Não deu para alterar a opção de iniciar ao fazer login: ${detail}`)
      toast.error('Não deu para alterar a opção de iniciar ao fazer login')
    } finally {
      setAutostartPending(false)
    }
  }

  useEffect(() => {
    if (!profile) return
    if (profile.display_name) setDisplayNameDraft(profile.display_name)
    setPixKeyDraft(profile.pix_key ?? '')
    setThemeDraft(profile.theme ?? 'neutral-command')
  }, [profile])

  useEffect(() => {
    if (!selectedAccount) return
    setSafetyBufferDraft(selectedAccount.safety_buffer.toString())
  }, [selectedAccount])

  const updateProfileMutation = useMutation({
    mutationFn: (overrides?: { theme?: string }) =>
      updateProfile(selectedAccountId as string, {
        display_name: displayNameDraft,
        pix_key: pixKeyDraft.trim() || null,
        theme: overrides?.theme ?? themeDraft,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', selectedAccountId] })
      toast.success('Preferências salvas')
    },
    onError: () => toast.error('Não deu para salvar as preferências'),
  })

  const updateSafetyBufferMutation = useMutation({
    mutationFn: () => {
      if (!selectedAccount) throw new Error('Nenhuma conta selecionada')
      const parsed = Number(safetyBufferDraft)
      return updateAccount(selectedAccount.id, { safety_buffer: Number.isFinite(parsed) ? parsed : 0 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Margem de segurança salva')
    },
    onError: () => toast.error('Não deu para salvar a margem de segurança'),
  })

  const backfillCategoriesMutation = useMutation({
    mutationFn: backfillCategories,
    onSuccess: ({ scanned, categorized }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success(scanned === 0 ? 'Nenhum gasto sem categoria' : `${categorized} de ${scanned} gastos categorizados`)
    },
    onError: () => toast.error('Não deu para categorizar as transações'),
  })

  return (
    <div className={pageShell}>
      <PageHeader
        eyebrow="Configurações"
        title="Preferências"
        description="Gerencie como o seu perfil e os dados de pagamento aparecem."
      />

      <SettingsPanel
        icon={Palette}
        title="Aparência"
        description="Claro ou escuro. Aplicado na hora neste aparelho."
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Tema</span>
          <div className="flex gap-1.5">
            {(['dark', 'light'] as const).map(mode => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={theme === mode ? 'default' : 'outline'}
                aria-pressed={theme === mode}
                onClick={() => setTheme(mode)}
                className="capitalize"
              >
                {mode === 'dark' ? 'Escuro' : 'Claro'}
              </Button>
            ))}
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        icon={User}
        title="Preferências do perfil"
        description="Este nome aparece nas telas compartilhadas."
      >
        <div className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3">
          <Label htmlFor="display-name" className="text-muted-foreground">Nome de exibição *</Label>
          <Input
            id="display-name"
            value={displayNameDraft}
            onChange={e => setDisplayNameDraft(e.target.value)}
            placeholder="Como as pessoas devem ver o seu nome?"
          />

          <Label htmlFor="pix-key" className="flex items-center gap-2 text-muted-foreground">
            <HandCoins size={14} />
            Chave PIX (opcional)
          </Label>
          <div className="flex flex-col gap-1">
            <Input
              id="pix-key"
              value={pixKeyDraft}
              onChange={e => setPixKeyDraft(e.target.value)}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
            />
            <p className="text-xs text-faint">Usada quando os amigos precisarem da sua chave de pagamento.</p>
          </div>
        </div>

        <div>
          <Button
            size="sm"
            onClick={() => updateProfileMutation.mutate({})}
            disabled={updateProfileMutation.isPending || !displayNameDraft.trim() || !selectedAccountId}
          >
            <Save size={14} />
            {updateProfileMutation.isPending ? 'Salvando...' : 'Salvar preferências'}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Margem de segurança da conta"
        description="Mantenha este valor em reais na conta selecionada antes de aprovar compras. Ele deixa de valer quando o widget Reserva é ativado, porque o saldo da reserva ocupa o lugar dele."
      >
        <div className="grid grid-cols-[120px_1fr] items-center gap-x-4">
          <Label htmlFor="safety-buffer" className="text-muted-foreground">Margem de segurança ($)</Label>
          <Input
            id="safety-buffer"
            className="num"
            inputMode="decimal"
            value={safetyBufferDraft}
            onChange={e => setSafetyBufferDraft(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <Button
            size="sm"
            onClick={() => updateSafetyBufferMutation.mutate()}
            disabled={updateSafetyBufferMutation.isPending || !selectedAccount}
          >
            <Save size={14} />
            {updateSafetyBufferMutation.isPending ? 'Salvando...' : 'Salvar margem de segurança'}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        icon={Tags}
        title="Categorias"
        description="Defina a categoria dos gastos sem categoria a partir das descrições. As categorias que você já definiu não são alteradas."
      >
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => backfillCategoriesMutation.mutate()}
            disabled={backfillCategoriesMutation.isPending}
          >
            {backfillCategoriesMutation.isPending ? 'Categorizando...' : 'Categorizar transações sem categoria'}
          </Button>
        </div>
        <p className="text-xs text-faint" data-testid="classifier-status">
          {layaStatus?.state === 'active' && 'Classificador: regras, depois o modelo Laya no aparelho.'}
          {layaStatus?.state === 'missing' && `Classificador: só regras. Modelo Laya não encontrado em ${layaStatus.folder}. Execute scripts\\export-laya.ps1 para instalar.`}
          {(layaStatus === undefined || layaStatus.state === 'rules') && 'Classificador: só regras.'}
        </p>
      </SettingsPanel>

      <SettingsPanel
        icon={Power}
        title="Inicialização"
        description="Abre o cibi quando você entra no Windows. Ele começa escondido na bandeja."
      >
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="start-at-login" className="text-muted-foreground">Iniciar ao fazer login</Label>
          <Switch
            id="start-at-login"
            checked={autostartEnabled}
            disabled={autostartAvailable !== true || autostartPending}
            onCheckedChange={(next) => void handleAutostartChange(next)}
          />
        </div>
        {autostartAvailable === false && (
          <p className="text-xs text-faint">Iniciar ao fazer login não está disponível aqui.</p>
        )}
        {autostartError && (
          <p role="alert" className="text-xs text-neg">{autostartError}</p>
        )}
      </SettingsPanel>
    </div>
  )
}
