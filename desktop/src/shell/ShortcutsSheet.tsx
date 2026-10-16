import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { shortcutRegistry, type ShortcutBinding } from '@/hooks/useKeyboardShortcuts'
import { KeyChips } from './KeyChips'

interface ShortcutsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function groupBindings(bindings: ShortcutBinding[]) {
  const groups = new Map<string, ShortcutBinding[]>()
  for (const binding of bindings) {
    if (!binding.label) continue
    const group = binding.group ?? 'Other'
    groups.set(group, [...(groups.get(group) ?? []), binding])
  }
  return [...groups.entries()]
}

export function ShortcutsSheet({ open, onOpenChange }: ShortcutsSheetProps) {
  const groups = groupBindings(shortcutRegistry.list())

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Keyboard shortcuts</SheetTitle>
          <SheetDescription>Shortcuts are ignored while you type in a field.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-auto px-4 pb-4">
          {groups.map(([group, bindings]) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-1.5 font-mono text-[10px] tracking-wider text-faint uppercase">{group}</h3>
              {bindings.map(binding => (
                <div key={`${binding.keys}-${binding.label}`} className="flex h-8 items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{binding.label}</span>
                  <KeyChips keys={binding.keys} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
