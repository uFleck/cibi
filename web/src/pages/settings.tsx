/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, User, HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchProfile, updateProfile } from '@/lib/api'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [pixKeyDraft, setPixKeyDraft] = useState('')

  useEffect(() => {
    if (!profile) return
    if (profile.display_name) setDisplayNameDraft(profile.display_name)
    setPixKeyDraft(profile.pix_key ?? '')
  }, [profile])

  const updateProfileMutation = useMutation({
    mutationFn: () => updateProfile({ display_name: displayNameDraft, pix_key: pixKeyDraft.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Preferences saved')
    },
    onError: () => toast.error('Could not save preferences'),
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
              disabled={updateProfileMutation.isPending || !displayNameDraft.trim()}
            >
              <Save size={14} />
              {updateProfileMutation.isPending ? 'Saving...' : 'Save preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
