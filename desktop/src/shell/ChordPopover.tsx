import { useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { shortcutRegistry } from '@/hooks/useKeyboardShortcuts'
import { KeyChips } from './KeyChips'

export function ChordPopover() {
  const chord = useSyncExternalStore(shortcutRegistry.subscribeChord, shortcutRegistry.getChord, () => null)
  const reduceMotion = useReducedMotion()

  if (!chord) return null

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed bottom-20 left-3 z-50 min-w-[190px] rounded-over border border-line-strong bg-surface p-2.5 shadow-pop min-[900px]:bottom-12 min-[900px]:left-16"
    >
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-faint uppercase">
        <KeyChips keys={chord.keys} />
        then
      </div>
      {chord.options.map(option => (
        <div key={`${option.keys}-${option.label}`} className="flex h-6 items-center gap-2.5 text-muted-foreground">
          <KeyChips keys={option.keys} className="w-8" />
          <span>{option.label}</span>
        </div>
      ))}
    </motion.div>
  )
}
