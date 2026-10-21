import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  confirmPaySchedule,
  createPaySchedule,
  deletePaySchedule,
  updatePaySchedule,
  type CreatePayScheduleRequest,
} from '@/lib/api'

/** The pay schedule mutations, each refreshing what it changes. `onSaved` runs after a create or an update. */
export function usePayScheduleMutations(onSaved?: () => void) {
  const queryClient = useQueryClient()
  const refreshSchedules = () => queryClient.invalidateQueries({ queryKey: ['pay-schedules'] })
  const onError = (fallback: string) => (error: Error) => toast.error(error.message || fallback)

  const create = useMutation({
    mutationFn: createPaySchedule,
    onSuccess: () => {
      toast.success('Recebimento adicionado')
      refreshSchedules()
      onSaved?.()
    },
    onError: onError('Não deu para adicionar o recebimento'),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePayScheduleRequest> }) => updatePaySchedule(id, data),
    onSuccess: () => {
      toast.success('Recebimento atualizado')
      refreshSchedules()
      onSaved?.()
    },
    onError: onError('Não deu para atualizar o recebimento'),
  })

  const remove = useMutation({
    mutationFn: deletePaySchedule,
    onSuccess: () => {
      toast.success('Recebimento excluído')
      refreshSchedules()
    },
    onError: onError('Não deu para excluir o recebimento'),
  })

  const confirm = useMutation({
    mutationFn: confirmPaySchedule,
    onSuccess: () => {
      toast.success('Recebimento confirmado')
      refreshSchedules()
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['ledger'] })
    },
    onError: onError('Não deu para confirmar o recebimento'),
  })

  return { create, update, remove, confirm }
}
