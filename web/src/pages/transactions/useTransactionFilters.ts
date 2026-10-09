import { useState, useMemo, useEffect, useCallback } from 'react'
import type { TransactionPreset } from '@/components/TransactionFilters'
import type { TransactionResponse, PayScheduleResponse } from '@/lib/api'
import { matchesPresetFilter } from '@/lib/transactions-impact'

export function useTransactionFilters(
  currentAccountId: string | undefined,
  transactions: TransactionResponse[],
  nextPayday: string | null,
  paySchedules: PayScheduleResponse[],
) {
  const [sortField, setSortField] = useState<'description' | 'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [preset, setPreset] = useState<TransactionPreset | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')

  const filteredAndSortedTxns = useMemo(() => {
    const now = new Date()

    let txns = transactions.filter((t: TransactionResponse) => t.type === 'personal')

    txns = txns.filter((t: TransactionResponse) => matchesPresetFilter({
      txn: t,
      preset,
      now,
      nextPayday,
      paySchedules,
    }))

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      txns = txns.filter(t => t.description.toLowerCase().includes(q))
    }

    const minVal = parseFloat(amountMin)
    const maxVal = parseFloat(amountMax)
    if (!isNaN(minVal)) {
      txns = txns.filter(t => Math.abs(t.amount) >= minVal)
    }
    if (!isNaN(maxVal)) {
      txns = txns.filter(t => Math.abs(t.amount) <= maxVal)
    }

    txns.sort((a: TransactionResponse, b: TransactionResponse) => {
      let cmp = 0
      if (sortField === 'description') {
        cmp = a.description.localeCompare(b.description)
      } else if (sortField === 'date') {
        const dateA = a.is_recurring
          ? (a.next_occurrence || a.anchor_date || a.timestamp || '')
          : (a.requires_confirmation ? (a.anchor_date || a.timestamp || '') : (a.timestamp || a.anchor_date || ''))
        const dateB = b.is_recurring
          ? (b.next_occurrence || b.anchor_date || b.timestamp || '')
          : (b.requires_confirmation ? (b.anchor_date || b.timestamp || '') : (b.timestamp || b.anchor_date || ''))
        cmp = dateA.localeCompare(dateB)
      } else if (sortField === 'amount') {
        cmp = a.amount - b.amount
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    
    return txns
  }, [transactions, preset, sortField, sortDir, nextPayday, paySchedules, searchQuery, amountMin, amountMax])

  const hasActiveFilters = preset !== null || !!searchQuery.trim() || !!(amountMin || amountMax)

  const handleClearFilters = useCallback(() => {
    setPreset(null)
    setSearchQuery('')
    setAmountMin('')
    setAmountMax('')
  }, [])

  // Filter state persistence
  const FILTER_KEY = `cibi:filters:${currentAccountId}`
  useEffect(() => {
    if (!currentAccountId) return
    try {
      const saved = sessionStorage.getItem(FILTER_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.preset !== undefined) setPreset(state.preset as TransactionPreset | null)
        if (state.sortField) setSortField(state.sortField)
        if (state.sortDir) setSortDir(state.sortDir)
      }
    } catch { /* ignore */ }
  }, [currentAccountId])

  useEffect(() => {
    if (!currentAccountId) return
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      preset, sortField, sortDir,
    }))
  }, [preset, sortField, sortDir, currentAccountId])

  return {
    preset, setPreset,
    sortField, setSortField,
    sortDir, setSortDir,
    showFilters, setShowFilters,
    searchQuery, setSearchQuery,
    amountMin, setAmountMin,
    amountMax, setAmountMax,
    filteredAndSortedTxns,
    hasActiveFilters,
    handleClearFilters,
  }
}
