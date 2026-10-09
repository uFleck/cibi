import { History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { LedgerEntryResponse } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'

export function LedgerTab({ ledgerEntries, currentAccountCurrency }: { ledgerEntries: LedgerEntryResponse[]; currentAccountCurrency: string }) {
  return (
        <div className="flex flex-col gap-1">
          {ledgerEntries.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="mx-auto mb-4 text-muted-foreground/40" size={40} />
                <p className="text-muted-foreground">No activity yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col divide-y divide-border/50 pt-2 pb-0">
                {ledgerEntries.map((entry: LedgerEntryResponse) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-muted-foreground">{formatDate(entry.posted_at)}</span>
                      <span className="text-sm truncate">{entry.description}</span>
                    </div>
                    <span
                      className={
                        entry.amount >= 0
                          ? 'text-sm font-medium text-green-600 shrink-0'
                          : 'text-sm font-medium text-red-500 shrink-0'
                      }
                    >
                      {entry.amount >= 0 ? '+' : ''}{formatMoney(entry.amount, currentAccountCurrency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
  )
}
