import { useContext, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, User, HandCoins, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchAccounts, fetchProfile, updateAccount, updateProfile } from '@/lib/api'
import { AccountContext } from '@/App'

const THEMES: { id: string; label: string; primary: string }[] = [
  { id: 'green-anchor',    label: 'Green',   primary: 'oklch(0.62 0.19 142)' },
  { id: 'neutral-command', label: 'Navy',    primary: 'oklch(0.55 0.10 240)' },
  { id: 'teal-bridge',     label: 'Teal',    primary: 'oklch(0.60 0.14 195)' },
  { id: 'warm-amber',      label: 'Amber',   primary: 'oklch(0.72 0.17 70)'  },
  { id: 'rose-noir',       label: 'Rose',    primary: 'oklch(0.60 0.16 340)' },
]

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId } = useContext(AccountContext)

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

  function handleThemeSelect(themeId: string) {
    setThemeDraft(themeId)
    document.documentElement.setAttribute('data-theme', themeId)
    updateProfileMutation.mutate({ theme: themeId })
  }

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
            Choose a color theme for this account. Applied immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                aria-label={t.label}
                aria-pressed={themeDraft === t.id}
                onClick={() => handleThemeSelect(t.id)}
                className={`flex flex-col items-center gap-1.5 rounded-lg p-2 border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  themeDraft === t.id
                    ? 'border-primary bg-primary/10 ring-2 ring-primary'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <span
                  className="w-8 h-8 rounded-full block"
                  style={{ background: t.primary }}
                />
                <span className="text-xs text-muted-foreground">{t.label}</span>
              </button>
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
            This name is shown in public pages and shared views.
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
              onClick={() => updateProfileMutation.mutate()}
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
    </div>
  )
}
