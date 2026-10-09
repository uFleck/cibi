import { Plus, ArrowLeftRight, X } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import type { TransactionPreset } from '@/components/TransactionFilters'
import type { TransactionResponse } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { useTransactionsData } from './useTransactionsData'

export function ImpactCard({ unconfirmedImpact, currentAccountCurrency, onConfirmAll }: {
  unconfirmedImpact: ReturnType<typeof useTransactionsData>['unconfirmedImpact']
  currentAccountCurrency: string
  onConfirmAll: () => void
}) {
  return (
      <Card>
        <CardContent className="py-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Unconfirmed payment impact</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <p>Current: <MoneyValue amount={unconfirmedImpact.currentAmount} currency={currentAccountCurrency} tone="negative" showSign="never" /> <span className="text-xs text-muted-foreground">({unconfirmedImpact.currentCount})</span></p>
            <p>Next: <MoneyValue amount={unconfirmedImpact.nextAmount} currency={currentAccountCurrency} tone="negative" showSign="never" /> <span className="text-xs text-muted-foreground">({unconfirmedImpact.nextCount})</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            Balance if paid: <MoneyValue amount={unconfirmedImpact.currentProjectedBalance} currency={currentAccountCurrency} tone="auto" showSign="always" /> now · <MoneyValue amount={unconfirmedImpact.nextProjectedBalance} currency={currentAccountCurrency} tone="auto" showSign="always" /> after next.
          </p>

          {unconfirmedImpact.currentCount > 0 && (
            <Button size="sm" variant="outline" onClick={onConfirmAll}>
              Confirm all {unconfirmedImpact.currentCount}
            </Button>
          )}
        </CardContent>
      </Card>
  )
}

export function ActiveFilterBadges({ preset, windowLabels, searchQuery, amountMin, amountMax, setPreset, setSearchQuery, setAmountMin, setAmountMax, handleClearFilters }: {
  preset: TransactionPreset | null
  windowLabels: ReturnType<typeof useTransactionsData>['windowLabels']
  searchQuery: string
  amountMin: string
  amountMax: string
  setPreset: (p: TransactionPreset | null) => void
  setSearchQuery: (s: string) => void
  setAmountMin: (s: string) => void
  setAmountMax: (s: string) => void
  handleClearFilters: () => void
}) {
  return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Filters:</span>
          {preset !== null && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setPreset(null)}>
              {preset === 'due-now' ? windowLabels?.dueNowLabel :
               preset === 'current-window' ? windowLabels?.currentWindowLabel :
               preset === 'next-window' ? windowLabels?.nextWindowLabel :
               preset === 'all-recurring' ? 'All recurring' :
               preset === 'one-time-only' ? 'One-time only' : preset}
              <X size={12} />
            </Badge>
          )}
          {searchQuery.trim() && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setSearchQuery('')}>
              &ldquo;{searchQuery}&rdquo;
              <X size={12} />
            </Badge>
          )}
          {(amountMin || amountMax) && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { setAmountMin(''); setAmountMax('') }}>
              ${amountMin || '0'}–${amountMax || '∞'}
              <X size={12} />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs h-7">
            Clear all
          </Button>
        </div>
  )
}

export function TransactionList({ transactions, filteredAndSortedTxns, txnsLoading, currentAccountCurrency, handleCreateClick, handleConfirmClick, setConfirmDelete, handleEditClick }: {
  transactions: TransactionResponse[]
  filteredAndSortedTxns: TransactionResponse[]
  txnsLoading: boolean
  currentAccountCurrency: string
  handleCreateClick: () => void
  handleConfirmClick: (id: string) => void
  setConfirmDelete: (id: string) => void
  handleEditClick: (txn: TransactionResponse) => void
}) {
  return (
      <Skeleton
        name="transaction-list"
        loading={txnsLoading}
        fallback={
          <div className="flex flex-col gap-2" role="status" aria-label="Loading transactions">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
            ))}
            <span className="sr-only">Loading...</span>
          </div>
        }
      >
{transactions.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <ArrowLeftRight className="mx-auto mb-4 text-muted-foreground/40" size={40} />
              <p className="text-muted-foreground mb-4">No transactions yet</p>
              <Button onClick={handleCreateClick} size="sm">
                <Plus size={16} />
                Create First Transaction
              </Button>
            </CardContent>
          </Card>
        ) : (
          <SharedDebtList
            mode="auto"
            view="owner"
            items={filteredAndSortedTxns.map((txn: TransactionResponse) => ({
              id: txn.id,
              title: txn.description,
              subtitle: txn.is_installment
                ? `Installment · ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'} paid · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : '-'}`
                : txn.is_recurring
                  ? `${txn.frequency} · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : (txn.anchor_date ? formatDate(txn.anchor_date) : '-')}`
                  : txn.requires_confirmation
                    ? (txn.confirmed_at ? `confirmed ${formatDate(txn.confirmed_at)}` : `pending ${formatDate(txn.anchor_date || txn.timestamp)}`)
                    : formatDate(txn.timestamp),
              amount: txn.is_installment
                ? txn.amount * ((txn.total_installments ?? 0) - (txn.paid_installments ?? 0))
                : txn.amount,
              total: txn.is_installment
                ? txn.amount * (txn.total_installments ?? 0)
                : txn.amount,
              perInstallment: txn.is_installment ? txn.amount : null,
              currency: currentAccountCurrency,
              status: {
                label: txn.is_installment
                  ? `Installment ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'}`
                  : txn.is_recurring
                    ? 'Recurring'
                    : txn.requires_confirmation
                      ? (txn.confirmed_at ? 'Pending payment · confirmed' : 'Pending payment')
                      : 'One-time',
                tone: (txn.is_installment || txn.is_recurring || txn.requires_confirmation)
                  ? 'default'
                  : 'secondary',
              },
              type: 'transaction' as const,
              canConfirm: txn.is_installment
                ? (txn.paid_installments ?? 0) < (txn.total_installments ?? 0)
                : txn.is_recurring || (txn.requires_confirmation && !txn.confirmed_at),
              canDelete: true,
              canOpen: true,
            }))}
            emptyTitle="No transactions match your filters"
            emptyHint="Adjust filters and try again"
            onConfirm={handleConfirmClick}
            onDelete={setConfirmDelete}
            onOpen={(id) => {
              const txn = transactions.find((t: TransactionResponse) => t.id === id)
              if (txn) handleEditClick(txn)
            }}
          />
        )}
      </Skeleton>
  )
}
