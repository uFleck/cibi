import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useContext } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchFriendSummary, fetchFriendBreakdown } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { AccountContext } from '@/App'

export function FriendLedgerWidget() {
  const { selectedAccountId } = useContext(AccountContext)

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['friend-summary', selectedAccountId],
    queryFn: () => fetchFriendSummary(selectedAccountId!),
    enabled: !!selectedAccountId,
  })

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['friend-breakdown', selectedAccountId],
    queryFn: () => fetchFriendBreakdown(selectedAccountId!),
    enabled: !!selectedAccountId,
  })

  const isLoading = summaryLoading || breakdownLoading

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Friend Ledger</CardTitle>
        <Link to="/friends">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Go to Friends">
                <ChevronRight size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Go to Friends</p>
            </TooltipContent>
          </Tooltip>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading friend summary">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-5 rounded bg-muted animate-pulse" />
            ))}
            <span className="sr-only">Loading...</span>
          </div>
        ) : summary && (summary.total_owed_to_user !== 0 || summary.total_user_owes !== 0) ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">They owe me</span>
              <MoneyValue
                amount={summary.total_owed_to_user}
                tone="positive"
                showSign="auto"
                className="font-medium"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">I owe</span>
              <MoneyValue
                amount={summary.total_user_owes}
                tone="negative"
                showSign="auto"
                className="font-medium"
              />
            </div>
            <div className="flex justify-between border-t border-border/40 pt-1.5 mt-0.5">
              <span className="font-semibold">Net</span>
              <MoneyValue
                amount={summary.net}
                tone={summary.net > 0 ? 'positive' : summary.net < 0 ? 'negative' : 'neutral'}
                showSign="auto"
                className="font-semibold"
              />
            </div>

            {breakdown && breakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/40 flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
                  Next payments
                </span>
                {breakdown.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col cursor-default">
                          <span className="text-muted-foreground">{item.friend_name}</span>
                          {item.next_payment_date && (
                            <span className="text-[11px] text-muted-foreground/60">
                              {formatDate(item.next_payment_date)}
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="font-medium"><MoneyValue amount={item.total_amount} showSign="auto" /> total</p>
                        {item.is_installment && (
                          <p className="text-muted-foreground">
                            <MoneyValue amount={item.per_install_amount} showSign="auto" />/installment
                            {' '}({item.paid_installments}/{item.total_installments} paid)
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                    <MoneyValue
                      amount={item.next_payment}
                      tone="negative"
                      showSign="auto"
                      className="font-medium shrink-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            No outstanding balances
          </p>
        )}
      </CardContent>
    </Card>
  )
}
