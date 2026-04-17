import * as React from 'react'
import * as RechartsPrimitive from 'recharts'

import { cn } from '@/lib/utils'

type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
  }
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['children']
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50 [&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-layer]:outline-none',
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  if (!Object.values(config).some(cfg => cfg.color)) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(config)
          .filter(([, cfg]) => cfg.color)
          .map(([key, cfg]) => `[data-chart=${id}] { --color-${key}: ${cfg.color}; }`)
          .join('\n'),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

interface ChartTooltipContentProps {
  active?: boolean
  payload?: Array<{
    value?: unknown
    name?: string
    color?: string
    dataKey?: string | number
  }>
  className?: string
  hideLabel?: boolean
  formatter?: (value: unknown, name?: string) => React.ReactNode
}

function ChartTooltipContent({
  active,
  payload,
  className,
  hideLabel = false,
  formatter,
}: ChartTooltipContentProps) {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  return (
    <div className={cn('rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl', className)}>
      <div className="grid gap-1.5">
        {payload.map((item, index: number) => {
          const key = `${item.dataKey || item.name || 'value'}`
          const itemConfig = config[key] ?? config.value
          const label = itemConfig?.label ?? item.name

          return (
            <div key={index} className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: item.color }} />
              {!hideLabel ? <span className="text-muted-foreground">{label}</span> : null}
              <span className="ml-auto font-mono font-medium tabular-nums">
                {formatter
                  ? formatter(item.value, item.name)
                  : (typeof item.value === 'number' || typeof item.value === 'string'
                    ? item.value
                    : String(item.value ?? ''))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { ChartContainer, ChartTooltip, ChartTooltipContent }
export type { ChartConfig }
