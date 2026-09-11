import { useState } from 'react'
import { EditSheet } from '@/components/EditSheet'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { nextPaydayAfter } from '@/lib/pay-schedule'
import type { PayScheduleResponse } from '@/lib/api'

export interface CustomProjectionConfig {
  windowStart: Date
  windowEnd: Date
  excludeBalance: boolean
}

interface CustomProjectionSheetProps {
  open: boolean
  paySchedules: PayScheduleResponse[]
  onApply: (config: CustomProjectionConfig) => void
  onClose: () => void
}

export function CustomProjectionSheet({ open, paySchedules, onApply, onClose }: CustomProjectionSheetProps) {
  const [selectedStart, setSelectedStart] = useState<Date | null>(null)
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null)
  const [excludeBalance, setExcludeBalance] = useState(false)

  const now = new Date()
  const sixMonthsOut = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  const allDates: Date[] = []
  for (const schedule of paySchedules) {
    let occ = nextPaydayAfter(schedule, new Date(now.getTime() - 1))
    let safety = 0
    while (occ.getTime() < sixMonthsOut.getTime() && safety < 30) {
      allDates.push(occ)
      occ = nextPaydayAfter(schedule, occ)
      safety++
    }
  }
  const uniqueDates = Array.from(
    new Map(allDates.map(d => [d.toISOString().slice(0, 10), d])).values(),
  ).sort((a, b) => a.getTime() - b.getTime())

  const endDates = selectedStart
    ? uniqueDates.filter(d => d.getTime() > selectedStart.getTime())
    : []

  function handleApply() {
    if (!selectedStart || !selectedEnd) return
    onApply({ windowStart: selectedStart, windowEnd: selectedEnd, excludeBalance })
    onClose()
  }

  return (
    <EditSheet
      open={open}
      onOpenChange={o => { if (!o) onClose() }}
      title="Custom projection"
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2">Start paycheck</p>
          <div className="flex flex-wrap gap-2">
            {uniqueDates.map(d => (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => { setSelectedStart(d); setSelectedEnd(null) }}
                className={`text-xs px-2 py-1 rounded border transition-colors ${selectedStart?.toISOString() === d.toISOString() ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
              >
                {formatDate(d.toISOString())}
              </button>
            ))}
          </div>
        </div>
        {selectedStart && (
          <div>
            <p className="text-sm font-medium mb-2">End paycheck</p>
            <div className="flex flex-wrap gap-2">
              {endDates.map(d => (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setSelectedEnd(d)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${selectedEnd?.toISOString() === d.toISOString() ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                >
                  {formatDate(d.toISOString())}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={excludeBalance}
            onChange={e => setExcludeBalance(e.target.checked)}
            className="rounded"
          />
          Start from zero (ignore current balance)
        </label>
        <Button onClick={handleApply} disabled={!selectedStart || !selectedEnd} className="w-full">
          Apply
        </Button>
      </div>
    </EditSheet>
  )
}
