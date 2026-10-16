import { useId, useState, type PointerEvent } from 'react'
import { formatMoney } from '@/lib/format'
import { APP_LOCALE } from '@/lib/locale'
import type { BalancePoint } from '@/lib/balance-series'

const WIDTH = 640
const HEIGHT = 190
const GRID = [0.25, 0.5, 0.75]
const AXIS_STOPS = [0, 0.25, 0.5, 0.75, 1]

interface BalanceChartProps {
  points: BalancePoint[]
  /** Balance below which the money is spoken for. */
  floor: number
  currency: string
  /** Mark the right edge as a payday. */
  endsOnPayday: boolean
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
}

export function BalanceChart({ points, floor, currency, endsOnPayday }: BalanceChartProps) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const last = points.length - 1
  const balances = points.map(p => p.balance)
  const lo = Math.min(...balances, floor)
  const hi = Math.max(...balances, floor)
  const pad = (hi - lo) * 0.1 || 1
  const min = lo - pad
  const max = hi + pad

  const x = (i: number) => (i / last) * WIDTH
  const y = (v: number) => HEIGHT - ((v - min) / (max - min)) * HEIGHT

  const line = 'M' + points.map((p, i) => `${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' L')
  const floorY = y(floor)

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    setHover(Math.round(fraction * last))
  }

  const hovered = hover === null ? null : points[hover]
  const hoveredLeft = hover === null ? 0 : (hover / last) * 100
  const hoveredTop = hovered === null ? 0 : (y(hovered.balance) / HEIGHT) * 100
  const gap = hovered ? hovered.balance - floor : 0

  return (
    <div>
      <div
        role="img"
        aria-label={`Projected balance from ${shortDate(points[0].date)} to ${shortDate(points[last].date)}, ending at ${formatMoney(points[last].balance, currency)}`}
        className="relative mt-1 h-[150px] cursor-crosshair @min-[760px]/widget:h-[210px] @max-[340px]/widget:h-[116px]"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--hl)" stopOpacity=".3" />
              <stop offset="1" stopColor="var(--hl)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {GRID.map(f => (
            <line
              key={f}
              x1={0}
              x2={WIDTH}
              y1={HEIGHT * f}
              y2={HEIGHT * f}
              stroke="var(--line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g className="chart-reveal">
            <path d={`${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`} fill={`url(#${gradientId})`} />
          </g>
          <line
            x1={0}
            x2={WIDTH}
            y1={floorY}
            y2={floorY}
            stroke="var(--neg)"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={line}
            className="chart-reveal"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {endsOnPayday && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 border-r border-dashed border-line-strong" />}

        {hovered && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-0 border-l border-faint"
              style={{ left: `${hoveredLeft}%` }}
            >
              <i
                className="absolute -left-1 size-[7px] rounded-full bg-foreground ring-[3px] ring-surface"
                style={{ top: `calc(${hoveredTop}% - 3.5px)` }}
              />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 z-10 translate-x-2.5 rounded-sm bg-foreground px-2 py-1.5 text-[11.5px] leading-[1.35] whitespace-nowrap text-background"
              style={{ left: `min(${hoveredLeft}%, calc(100% - 170px))` }}
            >
              <b className="font-semibold">{shortDate(hovered.date)}</b> · {formatMoney(hovered.balance, currency)}
              <br />
              <span className="opacity-65">
                {gap >= 0
                  ? `${formatMoney(gap, currency)} above buffer`
                  : `${formatMoney(-gap, currency)} below buffer`}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-faint">
        {AXIS_STOPS.map(f => (
          <span key={f}>{shortDate(points[Math.round(f * last)].date)}</span>
        ))}
      </div>
    </div>
  )
}
