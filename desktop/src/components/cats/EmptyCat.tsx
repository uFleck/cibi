import { useState, type ReactNode } from 'react'
import { meow } from '@/lib/meow'
import { cn } from '@/lib/utils'
import { Cat, type CatMood } from './Cat'

interface EmptyCatProps {
  children: ReactNode
  mood?: CatMood
  size?: number
  className?: string
}

/** An empty state with a cat. Poke the cat and it wakes up for a moment. */
export function EmptyCat({ children, mood = 'sleep', size = 64, className }: EmptyCatProps) {
  const [awake, setAwake] = useState(false)

  return (
    <div className={cn('flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground', className)}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="squish cursor-pointer rounded-full outline-none"
        onClick={() => {
          if (awake) return
          setAwake(true)
          meow(1.15, 0.07)
          window.setTimeout(() => setAwake(false), 1800)
        }}
      >
        <Cat size={size} mood={awake ? 'happy' : mood} />
      </button>
      <div>{children}</div>
    </div>
  )
}
