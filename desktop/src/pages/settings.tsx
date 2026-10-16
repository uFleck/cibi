import { useContext, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, User, HandCoins, Palette, Power } from 'lucide-react'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fetchAccounts, fetchProfile, updateAccount, updateProfile } from '@/lib/api'
import { AccountContext, ThemeContext } from '@/App'

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

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Preferences</h1>
        <p className="text-sm text-muted-foreground">Manage how your profile and payment details appear.</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette size={16} />
            Appearance
          </CardTitle>
          <CardDescription>
            Light or dark. Applied immediately on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(['dark', 'light'] as const).map(mode => (
              <Button
                key={mode}
                type="button"
                variant={theme === mode ? 'default' : 'outline'}
                aria-pressed={theme === mode}
                onClick={() => setTheme(mode)}
                className="capitalize"
              >
                {mode}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User size={16} />
            Profile preferences
          </CardTitle>
          <CardDescription>
            This name is shown in shared views.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="display-name">Display name *</Label>
            <Input
              id="display-name"
              value={displayNameDraft}
              onChange={e => setDisplayNameDraft(e.target.value)}
              placeholder="How should people see your name?"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pix-key" className="flex items-center gap-2">
              <HandCoins size={14} />
              PIX key (optional)
            </Label>
            <Input
              id="pix-key"
              value={pixKeyDraft}
              onChange={e => setPixKeyDraft(e.target.value)}
              placeholder="CPF, email, phone, or random key"
            />
            <p className="text-xs text-muted-foreground">Used when friends need your payment key.</p>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account safety buffer</CardTitle>
          <CardDescription>
            Reserve this amount in dollars in the selected account before approving purchases.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="safety-buffer">Safety buffer ($)</Label>
            <Input
              id="safety-buffer"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Power size={16} />
            Startup
          </CardTitle>
          <CardDescription>
            Open cibi when you sign in to Windows. It starts hidden in the tray.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="start-at-login">Start at login</Label>
            <Switch
              id="start-at-login"
              checked={autostartEnabled}
              disabled={autostartAvailable !== true || autostartPending}
              onCheckedChange={(next) => void handleAutostartChange(next)}
            />
          </div>
          {autostartAvailable === false && (
            <p className="text-xs text-muted-foreground">Start at login is not available here.</p>
          )}
          {autostartError && (
            <p role="alert" className="text-xs text-destructive">{autostartError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
