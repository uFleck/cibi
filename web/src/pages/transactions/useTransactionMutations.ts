import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  confirmTransaction,
  confirmInstallmentTransaction,
  type TransactionResponse,
} from '@/lib/api'
import type { FormData } from './types'

export function useTransactionMutations(
  currentAccountId: string,
  onCreated: () => void,
  onUpdated: () => void,
) {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: FormData) => createTransaction(data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Transaction created')
      onCreated()
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to create transaction')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<FormData> }) =>
      updateTransaction(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.map(t => t.id === id ? { ...t, ...updates } : t) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Transaction updated')
      onUpdated()
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to update transaction')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      const deletedTxn = prevTxns?.find(t => t.id === id) ?? null
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.filter(t => t.id !== id) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount, deletedTxn }
    },
    onSuccess: (_, _id, ctx) => {
      const deletedTxn = ctx?.deletedTxn
      const deletedName = deletedTxn?.description ?? 'Transaction'
      toast(`${deletedName} deleted`, {
        action: {
          label: 'Undo',
          onClick: () => {
            if (deletedTxn) {
              createMutation.mutate({
                account_id: deletedTxn.account_id,
                amount: deletedTxn.amount,
                description: deletedTxn.description,
                is_recurring: deletedTxn.is_recurring,
                frequency: deletedTxn.frequency ?? undefined,
                anchor_date: deletedTxn.anchor_date ?? undefined,
                requires_confirmation: deletedTxn.requires_confirmation,
                is_installment: deletedTxn.is_installment,
                total_installments: deletedTxn.total_installments ?? undefined,
              })
            }
          },
        },
        duration: 5000,
      })
    },
    onError: (error, _id, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to delete transaction')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmTransaction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.map(t => t.id === id ? { ...t, confirmed_at: new Date().toISOString() } : t) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Payment confirmed')
    },
    onError: (error, _id, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to confirm payment')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const confirmInstallmentMutation = useMutation({
    mutationFn: (id: string) => confirmInstallmentTransaction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.map(t => t.id === id ? { ...t, paid_installments: (t.paid_installments ?? 0) + 1 } : t) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Installment confirmed')
    },
    onError: (error, _id, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to confirm installment')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  return { createMutation, updateMutation, deleteMutation, confirmMutation, confirmInstallmentMutation }
}
