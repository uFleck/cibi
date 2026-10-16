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
      toast.success('Schedule added')
      refreshSchedules()
      onSaved?.()
    },
    onError: onError('Failed to add schedule'),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePayScheduleRequest> }) => updatePaySchedule(id, data),
    onSuccess: () => {
      toast.success('Schedule updated')
      refreshSchedules()
      onSaved?.()
    },
    onError: onError('Failed to update schedule'),
  })

  const remove = useMutation({
    mutationFn: deletePaySchedule,
    onSuccess: () => {
      toast.success('Schedule deleted')
      refreshSchedules()
    },
    onError: onError('Failed to delete schedule'),
  })

  const confirm = useMutation({
    mutationFn: confirmPaySchedule,
    onSuccess: () => {
      toast.success('Payday confirmed')
      refreshSchedules()
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['ledger'] })
    },
    onError: onError('Failed to confirm schedule'),
  })

  return { create, update, remove, confirm }
}
