import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface FriendFormProps {
  name: string
  notes: string
  pixKey: string
  onNameChange: (value: string) => void
  onNotesChange: (value: string) => void
  onPixKeyChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  isSubmitting?: boolean
  submitLabel?: string
  cancelLabel?: string
}

export function FriendForm({
  name,
  notes,
  pixKey,
  onNameChange,
  onNotesChange,
  onPixKeyChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = 'Create Friend',
  cancelLabel = 'Discard',
}: FriendFormProps) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <Label className="block text-sm font-medium mb-1">Name</Label>
        <Input
          required
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Alice"
        />
      </div>
      <div>
        <Label className="block text-sm font-medium mb-1">Notes (optional)</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Optional notes"
          className="resize-none"
        />
      </div>
      <div>
        <Label className="block text-sm font-medium mb-1">PIX key (optional)</Label>
        <Input
          value={pixKey}
          onChange={e => onPixKeyChange(e.target.value)}
          placeholder="CPF, phone, email, random key"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  )
}
