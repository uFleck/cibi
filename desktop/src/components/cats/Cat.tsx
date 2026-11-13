import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

export type CatMood = 'sit' | 'happy' | 'sleep' | 'oops' | 'party' | 'peek' | 'worried' | 'sad'
export type CatFur = 'cream' | 'ginger' | 'grey' | 'black' | 'calico'

interface FurColors {
  fur: string
  stroke: string
  feature: string
  ear: string
  patch?: string
}

// Fixed colors (not theme tokens): the cats look the same on light and dark backgrounds.
const FURS: Record<CatFur, FurColors> = {
  cream: { fur: '#fff6ee', stroke: '#5b3a4a', feature: '#5b3a4a', ear: '#ffc2d1' },
  ginger: { fur: '#ffcf9e', stroke: '#6b3d2a', feature: '#5b3a2a', ear: '#ffb3a7', patch: '#f4a96a' },
  grey: { fur: '#d9d4e6', stroke: '#4a4060', feature: '#3d3550', ear: '#f7c4d8', patch: '#bdb5d1' },
  black: { fur: '#3a3346', stroke: '#1e1a26', feature: '#ffe08a', ear: '#e79bb7' },
  calico: { fur: '#fff6ee', stroke: '#5b3a4a', feature: '#5b3a4a', ear: '#ffc2d1', patch: '#f4a96a' },
}

interface CatProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  mood?: CatMood
  fur?: CatFur
  size?: number
  /** Animated blink and tail swish. Off for tiny icons. */
  alive?: boolean
  /** Accessible name. Without one the cat is decorative. */
  title?: string
}

/** An original little cat, drawn inline so it scales and needs no image files. */
export function Cat({ mood = 'sit', fur = 'cream', size = 64, alive = true, title, className, ...props }: CatProps) {
  const c = FURS[fur]
  const peek = mood === 'peek'
  const closedEyes = mood === 'happy' || mood === 'sleep' || mood === 'party'
  const sw = 2.2
  const blue = mood === 'worried' || mood === 'sad'

  return (
    <svg
      viewBox={peek ? '0 4 64 38' : '0 0 64 64'}
      width={size}
      height={peek ? (size * 38) / 64 : size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0 overflow-visible', className)}
      {...props}
    >
      {!peek ? (
        <>
          {/* tail */}
          <g transform="translate(46 50)">
            <path
              className={alive && mood !== 'sleep' ? 'tail-swish' : undefined}
              d="M0 0 C 10 2, 14 -6, 10 -14 C 8 -18, 12 -20, 13 -17"
              fill="none"
              stroke={c.stroke}
              strokeWidth={sw + 3.6}
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(46 50)">
            <path
              className={alive && mood !== 'sleep' ? 'tail-swish' : undefined}
              d="M0 0 C 10 2, 14 -6, 10 -14 C 8 -18, 12 -20, 13 -17"
              fill="none"
              stroke={c.patch ?? c.fur}
              strokeWidth={sw + 0.6}
              strokeLinecap="round"
            />
          </g>
          {/* body */}
          <ellipse cx="32" cy="47" rx="16" ry="13" fill={c.fur} stroke={c.stroke} strokeWidth={sw} />
          <ellipse cx="32" cy="50" rx="8" ry="7" fill="#ffffff" opacity={fur === 'black' ? 0.12 : 0.55} />
          {/* front paws */}
          <ellipse cx="25" cy="59" rx="4.2" ry="3" fill={c.fur} stroke={c.stroke} strokeWidth={sw} />
          <ellipse cx="39" cy="59" rx="4.2" ry="3" fill={c.fur} stroke={c.stroke} strokeWidth={sw} />
        </>
      ) : null}

      {/* ears */}
      <path d="M17 24 L18 8 L30 17 Z" fill={c.fur} stroke={c.stroke} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M47 24 L46 8 L34 17 Z" fill={c.patch ?? c.fur} stroke={c.stroke} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M20 19 L20.5 12.5 L26 16.5 Z" fill={c.ear} />
      <path d="M44 19 L43.5 12.5 L38 16.5 Z" fill={c.ear} />

      {/* head */}
      <ellipse cx="32" cy="27" rx="17" ry="13.5" fill={c.fur} stroke={c.stroke} strokeWidth={sw} />
      {c.patch ? <path d="M38 15 C 45 16, 48.5 22, 48.6 27 C 44 25, 40 22, 38 15 Z" fill={c.patch} opacity="0.9" /> : null}

      {/* cheeks */}
      <ellipse cx="21.5" cy="31" rx="3.2" ry="2" fill="#ff9fb8" opacity="0.6" />
      <ellipse cx="42.5" cy="31" rx="3.2" ry="2" fill="#ff9fb8" opacity="0.6" />

      {/* eyes */}
      {closedEyes ? (
        mood === 'sleep' ? (
          <g fill="none" stroke={c.feature} strokeWidth="1.8" strokeLinecap="round">
            <path d="M22.5 26 q3 2.4 6 0" />
            <path d="M35.5 26 q3 2.4 6 0" />
          </g>
        ) : (
          <g fill="none" stroke={c.feature} strokeWidth="1.8" strokeLinecap="round">
            <path d="M22.5 27 q3 -3.4 6 0" />
            <path d="M35.5 27 q3 -3.4 6 0" />
          </g>
        )
      ) : mood === 'oops' ? (
        <g>
          <circle cx="25.5" cy="25.5" r="3.4" fill="#fff" stroke={c.feature} strokeWidth="1.4" />
          <circle cx="38.5" cy="25.5" r="3.4" fill="#fff" stroke={c.feature} strokeWidth="1.4" />
          <circle cx="25.5" cy="26" r="1.6" fill={c.feature === '#ffe08a' ? '#1e1a26' : c.feature} />
          <circle cx="38.5" cy="26" r="1.6" fill={c.feature === '#ffe08a' ? '#1e1a26' : c.feature} />
        </g>
      ) : (
        <g className={alive ? 'cat-blink' : undefined}>
          <ellipse cx="25.5" cy="26" rx="2.4" ry="3" fill={c.feature} />
          <ellipse cx="38.5" cy="26" rx="2.4" ry="3" fill={c.feature} />
          <circle cx="26.3" cy="24.9" r="0.9" fill="#fff" />
          <circle cx="39.3" cy="24.9" r="0.9" fill="#fff" />
        </g>
      )}

      {blue ? (
        <g fill="none" stroke={c.feature} strokeWidth="1.4" strokeLinecap="round">
          <path d="M22 21.6 L28 19.6" />
          <path d="M42 21.6 L36 19.6" />
        </g>
      ) : null}
      {mood === 'sad' ? (
        <path
          className={alive ? 'tear-drop' : undefined}
          d="M24.6 29.4 q1.7 2.8 0 3.8 q-1.7 -1 0 -3.8 z"
          fill="#9fd8ff"
          stroke="#5aa9d6"
          strokeWidth="0.6"
        />
      ) : null}

      {/* nose + mouth */}
      <path d="M30.4 30 h3.2 l-1.6 1.7 z" fill="#ff8fab" stroke="#ff8fab" strokeWidth="0.8" strokeLinejoin="round" />
      {mood === 'oops' ? (
        <ellipse cx="32" cy="34.6" rx="1.6" ry="1.9" fill={c.stroke} />
      ) : mood === 'happy' || mood === 'party' ? (
        <path d="M29 32.6 q3 4.6 6 0 z" fill="#ff8fab" stroke={c.stroke} strokeWidth="1.2" strokeLinejoin="round" />
      ) : mood === 'sad' ? (
        <path d="M28.6 35.4 q3.4 -3.4 6.8 0" fill="none" stroke={c.stroke} strokeWidth="1.3" strokeLinecap="round" />
      ) : mood === 'worried' ? (
        <path d="M28.4 34.4 q1.2 -1.4 2.4 0 q1.2 1.4 2.4 0 q1.2 -1.4 2.4 0" fill="none" stroke={c.stroke} strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M29 32.6 q1.5 1.8 3 0 q1.5 1.8 3 0" fill="none" stroke={c.stroke} strokeWidth="1.3" strokeLinecap="round" />
      )}

      {/* whiskers */}
      <g stroke={c.stroke} strokeWidth="1" strokeLinecap="round" opacity="0.55">
        <path d="M14 29 L6 27.5" />
        <path d="M14 32 L6 33" />
        <path d="M50 29 L58 27.5" />
        <path d="M50 32 L58 33" />
      </g>

      {mood === 'oops' ? (
        <path d="M50 14 q2.5 4 0 5.6 q-2.5 -1.6 0 -5.6 z" fill="#9fd8ff" stroke="#5aa9d6" strokeWidth="0.8" />
      ) : null}

      {mood === 'sleep' ? (
        <g fill={c.stroke} fontFamily="var(--font-sans)" fontWeight="800">
          <text x="49" y="12" fontSize="8" className={alive ? 'zzz' : undefined}>z</text>
          <text x="55" y="6" fontSize="6" className={alive ? 'zzz' : undefined} style={{ animationDelay: '0.9s' }}>z</text>
        </g>
      ) : null}

      {mood === 'sad' ? (
        <g>
          <g fill="#9fd8ff" stroke="#5aa9d6" strokeWidth="0.6">
            <path className={alive ? 'rain-drop' : undefined} d="M24 4 q1.2 2 0 2.8 q-1.2 -0.8 0 -2.8 z" />
            <path className={alive ? 'rain-drop' : undefined} style={{ animationDelay: '0.45s' }} d="M32 5 q1.2 2 0 2.8 q-1.2 -0.8 0 -2.8 z" />
            <path className={alive ? 'rain-drop' : undefined} style={{ animationDelay: '0.9s' }} d="M40 4 q1.2 2 0 2.8 q-1.2 -0.8 0 -2.8 z" />
          </g>
          <g fill="#cfd3e6">
            <ellipse cx="25" cy="0" rx="6" ry="4.6" />
            <ellipse cx="32.5" cy="-2.6" rx="7" ry="6" />
            <ellipse cx="40" cy="0" rx="6" ry="4.6" />
            <rect x="21" y="0" width="23" height="4.4" rx="2.2" />
          </g>
        </g>
      ) : null}

      {mood === 'party' ? (
        <g>
          <path d="M24 15 L31 -4 L38 14 Z" fill="#c9a7ff" stroke={c.stroke} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M27 8 L35 6 M25.6 12 L36.8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="31" cy="-5" r="2.6" fill="#ffd166" stroke={c.stroke} strokeWidth="1.2" />
        </g>
      ) : null}

      {peek ? (
        <>
          <ellipse cx="22" cy="40" rx="5" ry="3.4" fill={c.fur} stroke={c.stroke} strokeWidth={sw} />
          <ellipse cx="42" cy="40" rx="5" ry="3.4" fill={c.fur} stroke={c.stroke} strokeWidth={sw} />
        </>
      ) : null}
    </svg>
  )
}

/** A paw print, for confetti and little accents. */
export function PawPrint({ size = 16, className, ...props }: Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className} fill="currentColor" {...props}>
      <ellipse cx="12" cy="16" rx="5.4" ry="4.4" />
      <ellipse cx="5.2" cy="10.2" rx="2.3" ry="2.9" />
      <ellipse cx="9.4" cy="5.8" rx="2.3" ry="3" />
      <ellipse cx="14.6" cy="5.8" rx="2.3" ry="3" />
      <ellipse cx="18.8" cy="10.2" rx="2.3" ry="2.9" />
    </svg>
  )
}
