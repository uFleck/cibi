import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Cat, PawPrint, type CatFur, type CatMood } from '@/components/cats/Cat'
import { meow } from '@/lib/meow'
import { KONAMI, MIAU, celebrate, endsWithSequence, isEditable, onCelebrate, prefersReducedMotion, pushKey } from './secrets'

const FURS: CatFur[] = ['cream', 'ginger', 'grey', 'black', 'calico']
const MOODS: CatMood[] = ['sit', 'happy', 'party', 'sleep', 'oops']
const PAW_COLORS = ['var(--ink)', 'var(--hl)', 'var(--pos)', 'var(--warn)']

interface Drop {
  id: number
  left: number
  size: number
  delay: number
  duration: number
  spin: number
  fur: CatFur
  mood: CatMood
}

interface Paw {
  id: number
  dx: number
  dy: number
  rot: number
  size: number
  color: string
  delay: number
}

let nextId = 1
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]

function makeRain(): Drop[] {
  return Array.from({ length: 28 }, () => ({
    id: nextId++,
    left: Math.random() * 96,
    size: 28 + Math.random() * 34,
    delay: Math.random() * 2.2,
    duration: 3 + Math.random() * 2.5,
    spin: (Math.random() - 0.5) * 720,
    fur: pick(FURS),
    mood: pick(MOODS),
  }))
}

function makePaws(count: number, spread: number): Paw[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const dist = spread * (0.55 + Math.random() * 0.45)
    return {
      id: nextId++,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - spread * 0.4,
      rot: (Math.random() - 0.5) * 80,
      size: 14 + Math.random() * 12,
      color: pick(PAW_COLORS),
      delay: Math.random() * 0.15,
    }
  })
}

/** Secrets layer: cat rain (Konami code or typing "miau"), paw confetti, and a cat that sometimes strolls by. */
export function EasterEggs() {
  const [rain, setRain] = useState<Drop[]>([])
  const [paws, setPaws] = useState<Paw[]>([])
  const [walker, setWalker] = useState<{ id: number; fur: CatFur; petted: boolean } | null>(null)
  const keys = useRef<string[]>([])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return
      keys.current = pushKey(keys.current, event.key)
      if (endsWithSequence(keys.current, KONAMI) || endsWithSequence(keys.current, MIAU)) {
        keys.current = []
        celebrate('cat-rain')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))
    const stop = onCelebrate(kind => {
      if (kind === 'cat-rain') {
        meow(1.1)
        later(() => meow(1.35, 0.08), 350)
        if (prefersReducedMotion()) return
        setRain(makeRain())
        later(() => setRain([]), 8000)
      } else {
        const big = kind === 'all-paid'
        if (big) {
          meow(1.2)
          later(() => meow(1.45, 0.08), 260)
        }
        if (prefersReducedMotion()) return
        const burst = makePaws(big ? 22 : 7, big ? 220 : 90)
        setPaws(prev => [...prev, ...burst])
        const ids = new Set(burst.map(p => p.id))
        later(() => setPaws(prev => prev.filter(p => !ids.has(p.id))), 1800)
      }
    })
    return () => {
      stop()
      timers.forEach(window.clearTimeout)
    }
  }, [])

  // Every few minutes, maybe, a small cat walks along the top of the window.
  useEffect(() => {
    if (prefersReducedMotion()) return
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible' && Math.random() < 0.6) {
          setWalker({ id: nextId++, fur: pick(FURS), petted: false })
        }
        schedule()
      }, 120_000 + Math.random() * 240_000)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {rain.map(drop => (
        <div
          key={drop.id}
          className="cat-fall absolute top-0"
          style={{
            left: `${drop.left}%`,
            animationDelay: `${drop.delay}s`,
            animationDuration: `${drop.duration}s`,
            '--spin': `${drop.spin}deg`,
            transform: 'translateY(-15vh)',
          } as CSSProperties}
        >
          <Cat size={drop.size} fur={drop.fur} mood={drop.mood} alive={false} />
        </div>
      ))}

      {paws.length > 0 ? (
        <div className="absolute top-[55%] left-1/2">
          {paws.map(paw => (
            <span
              key={paw.id}
              className="paw-pop absolute"
              style={{
                color: paw.color,
                animationDelay: `${paw.delay}s`,
                '--dx': `${paw.dx}px`,
                '--dy': `${paw.dy}px`,
                '--rot': `${paw.rot}deg`,
                opacity: 0,
              } as CSSProperties}
            >
              <PawPrint size={paw.size} />
            </span>
          ))}
        </div>
      ) : null}

      {walker ? (
        <button
          key={walker.id}
          type="button"
          tabIndex={-1}
          className="cat-walk pointer-events-auto absolute bottom-1 left-0 cursor-pointer"
          onAnimationEnd={() => setWalker(null)}
          onClick={() => {
            meow(1.3, 0.08)
            setWalker(prev => (prev ? { ...prev, petted: true } : prev))
          }}
          title="miau?"
        >
          <Cat size={34} fur={walker.fur} mood={walker.petted ? 'happy' : 'sit'} />
        </button>
      ) : null}
    </div>
  )
}
