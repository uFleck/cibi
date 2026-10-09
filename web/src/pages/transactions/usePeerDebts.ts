import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  confirmDebt,
  deletePeerDebt,
  createPeerDebt,
  updatePeerDebt,
  type TransactionResponse,
  type CreatePeerDebtRequest,
} from '@/lib/api'

export function usePeerDebts(transactions: TransactionResponse[]) {
  const queryClient = useQueryClient()
  const [peerDebtFilter, setPeerDebtFilter] = useState<{ friendId: string; direction: 'all' | 'i-owe' | 'they-owe'; status: 'all' | 'confirmed' | 'pending' }>({ friendId: 'all', direction: 'all', status: 'all' })
  const [isCreatingDebt, setIsCreatingDebt] = useState(false)
  const [debtForm, setDebtForm] = useState({
    friend_id: '',
    amount: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null)
  const [editDebtDraft, setEditDebtDraft] = useState({ amount: '', description: '' })

  const filteredPeerDebts = useMemo(() => {
    let debts = transactions.filter((t: TransactionResponse) => t.type === 'peer')
    if (peerDebtFilter.friendId !== 'all') {
      debts = debts.filter(t => t.friend_id === peerDebtFilter.friendId)
    }
    if (peerDebtFilter.direction === 'i-owe') {
      debts = debts.filter(t => t.amount < 0)
    } else if (peerDebtFilter.direction === 'they-owe') {
      debts = debts.filter(t => t.amount > 0)
    }
    if (peerDebtFilter.status === 'confirmed') {
      debts = debts.filter(t => t.confirmed_at !== null)
    } else if (peerDebtFilter.status === 'pending') {
      debts = debts.filter(t => t.confirmed_at === null)
    }
    return debts
  }, [transactions, peerDebtFilter])

  const confirmPeerDebtMutation = useMutation({
    mutationFn: (id: string) => confirmDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Debt confirmed')
    },
    onError: () => toast.error('Failed to confirm debt'),
  })

  const deletePeerDebtMutation = useMutation({
    mutationFn: (id: string) => deletePeerDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Debt deleted')
    },
    onError: () => toast.error('Failed to delete debt'),
  })

  const updateDebtMutation = useMutation({
    mutationFn: ({ id, amount, description }: { id: string; amount: number; description: string }) =>
      updatePeerDebt(id, { amount, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Debt updated')
      setEditingDebtId(null)
    },
    onError: () => toast.error('Failed to update debt'),
  })

  const createDebtMutation = useMutation({
    mutationFn: (data: CreatePeerDebtRequest) => createPeerDebt(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Debt created')
      setIsCreatingDebt(false)
      setDebtForm({ friend_id: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10) })
    },
    onError: () => toast.error('Failed to create debt'),
  })

  return {
    peerDebtFilter, setPeerDebtFilter,
    isCreatingDebt, setIsCreatingDebt,
    debtForm, setDebtForm,
    editingDebtId, setEditingDebtId,
    editDebtDraft, setEditDebtDraft,
    filteredPeerDebts,
    confirmPeerDebtMutation,
    deletePeerDebtMutation,
    updateDebtMutation,
    createDebtMutation,
  }
}
