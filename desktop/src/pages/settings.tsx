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
      toast.success(next ? 'Start at login enabled' : 'Start at login disabled')
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setAutostartError(`Could not change start at login: ${detail}`)
      toast.error('Could not change start at login')
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
      toast.success('Preferences saved')
    },
    onError: () => toast.error('Could not save preferences'),
  })

  const updateSafetyBufferMutation = useMutation({
    mutationFn: () => {
      if (!selectedAccount) throw new Error('No selected account')
      const parsed = Number(safetyBufferDraft)
      return updateAccount(selectedAccount.id, { safety_buffer: Number.isFinite(parsed) ? parsed : 0 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Safety buffer saved')
    },
    onError: () => toast.error('Could not save safety buffer'),
  })

  const backfillCategoriesMutation = useMutation({
    mutationFn: backfillCategories,
    onSuccess: ({ scanned, categorized }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success(scanned === 0 ? 'No uncategorized expenses' : `Categorized ${categorized} of ${scanned} expenses`)
    },
    onError: () => toast.error('Could not categorize transactions'),
  })

  return (
    <div className={pageShell}>
      <PageHeader
        eyebrow="Settings"
        title="Preferences"
        description="Manage how your profile and payment details appear."
      />

      <SettingsPanel
        icon={Palette}
        title="Appearance"
        description="Light or dark. Applied immediately on this device."
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Theme</span>
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
                {mode}
              </Button>
            ))}
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        icon={User}
        title="Profile preferences"
        description="This name is shown in shared views."
      >
        <div className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3">
          <Label htmlFor="display-name" className="text-muted-foreground">Display name *</Label>
          <Input
            id="display-name"
            value={displayNameDraft}
            onChange={e => setDisplayNameDraft(e.target.value)}
            placeholder="How should people see your name?"
          />

          <Label htmlFor="pix-key" className="flex items-center gap-2 text-muted-foreground">
            <HandCoins size={14} />
            PIX key (optional)
          </Label>
          <div className="flex flex-col gap-1">
            <Input
              id="pix-key"
              value={pixKeyDraft}
              onChange={e => setPixKeyDraft(e.target.value)}
              placeholder="CPF, email, phone, or random key"
            />
            <p className="text-xs text-faint">Used when friends need your payment key.</p>
          </div>
        </div>

        <div>
          <Button
            size="sm"
            onClick={() => updateProfileMutation.mutate({})}
            disabled={updateProfileMutation.isPending || !displayNameDraft.trim() || !selectedAccountId}
          >
            <Save size={14} />
            {updateProfileMutation.isPending ? 'Saving...' : 'Save preferences'}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Account safety buffer"
        description="Keep this amount in dollars in the selected account before approving purchases. It stops applying once the Reserve widget is switched on, because the reserve balance takes its place."
      >
        <div className="grid grid-cols-[120px_1fr] items-center gap-x-4">
          <Label htmlFor="safety-buffer" className="text-muted-foreground">Safety buffer ($)</Label>
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
            {updateSafetyBufferMutation.isPending ? 'Saving...' : 'Save safety buffer'}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        icon={Tags}
        title="Categories"
        description="Set the category of uncategorized expenses from their descriptions. Categories you already set are not changed."
      >
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => backfillCategoriesMutation.mutate()}
            disabled={backfillCategoriesMutation.isPending}
          >
            {backfillCategoriesMutation.isPending ? 'Categorizing...' : 'Categorize uncategorized transactions'}
          </Button>
        </div>
        <p className="text-xs text-faint" data-testid="classifier-status">
          {layaStatus?.state === 'active' && 'Classifier: rules, then the on-device Laya model.'}
          {layaStatus?.state === 'missing' && `Classifier: rules only. Laya model not found in ${layaStatus.folder}. Run scripts\\export-laya.ps1 to install it.`}
          {(layaStatus === undefined || layaStatus.state === 'rules') && 'Classifier: rules only.'}
        </p>
      </SettingsPanel>

      <SettingsPanel
        icon={Power}
        title="Startup"
        description="Open cibi when you sign in to Windows. It starts hidden in the tray."
      >
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="start-at-login" className="text-muted-foreground">Start at login</Label>
          <Switch
            id="start-at-login"
            checked={autostartEnabled}
            disabled={autostartAvailable !== true || autostartPending}
            onCheckedChange={(next) => void handleAutostartChange(next)}
          />
        </div>
        {autostartAvailable === false && (
          <p className="text-xs text-faint">Start at login is not available here.</p>
        )}
        {autostartError && (
          <p role="alert" className="text-xs text-neg">{autostartError}</p>
        )}
      </SettingsPanel>
    </div>
  )
}
