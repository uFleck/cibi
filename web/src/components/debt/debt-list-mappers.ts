import type { DebtListItemVM } from '@/components/debt/shared-debt-list.types'
import type { ParticipantResponse, PeerDebtResponse, PublicFriendGroupResponse } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'

export function debtStatus(debt: PeerDebtResponse): DebtListItemVM['status'] {
  const isEffectivelyPaid = debt.is_confirmed || Math.abs(getDisplayAmount(debt)) <= Number.EPSILON
  if (isEffectivelyPaid) return { label: 'Paid', tone: 'default' }
  if (debt.is_installment && debt.total_installments != null && debt.total_installments > 0) {
    const perInstallment = debt.amount / debt.total_installments
    return {
      label: `${debt.paid_installments}/${debt.total_installments} paid`,
      tone: 'secondary',
      tooltip: `Per installment: R$ ${perInstallment.toFixed(2)}`,
    }
  }
  return { label: 'Unpaid', tone: 'outline' }
}

export function calculateNextPayDate(debt: PeerDebtResponse): string | null {
  const isEffectivelyPaid = debt.is_confirmed || Math.abs(getDisplayAmount(debt)) <= Number.EPSILON
  if (isEffectivelyPaid) return null

  if (debt.is_installment && debt.anchor_date && debt.frequency && debt.total_installments) {
    const anchor = new Date(debt.anchor_date)
    const nextInstallmentNum = debt.paid_installments + 1

    if (nextInstallmentNum > debt.total_installments) return null

    let nextDate: Date
    if (debt.frequency === 'monthly') {
      nextDate = new Date(anchor)
      nextDate.setMonth(anchor.getMonth() + nextInstallmentNum - 1)
    } else if (debt.frequency === 'weekly') {
      nextDate = new Date(anchor)
      nextDate.setDate(anchor.getDate() + (nextInstallmentNum - 1) * 7)
    } else {
      return debt.date
    }

    return nextDate.toISOString().split('T')[0]
  }

  return debt.date
}

export function getDisplayAmount(debt: PeerDebtResponse): number {
  if (debt.is_installment && debt.total_installments && debt.total_installments > 0) {
    const installmentAmount = debt.amount / debt.total_installments
    const remainingInstallments = debt.total_installments - debt.paid_installments
    return installmentAmount * remainingInstallments
  }
  return debt.amount
}

export function mapFriendDebtsToVM(input: PeerDebtResponse[]): DebtListItemVM[] {
  return input.map((debt) => {
    const remainingAmount = getDisplayAmount(debt)
    const nextDate = calculateNextPayDate(debt)
    const baseSubtitle = nextDate ? `Next payment: ${formatDate(nextDate)}` : 'No pending payment'

    const subtitle = debt.is_installment
      ? `${baseSubtitle} · Total: ${formatMoney(debt.amount, 'BRL')}`
      : baseSubtitle

    const canConfirm = debt.is_installment
      ? !debt.is_confirmed && debt.paid_installments < (debt.total_installments ?? 0)
      : !debt.is_confirmed

    return {
      id: debt.id,
      title: debt.description,
      subtitle,
      amount: remainingAmount,
      currency: 'BRL',
      status: debtStatus(debt),
      canConfirm,
      canDelete: true,
      canCopy: false,
    }
  })
}

export function mapPublicDebtsToVM(input: PeerDebtResponse[]): DebtListItemVM[] {
  return input.map((debt) => ({
    id: debt.id,
    title: debt.description,
    subtitle: calculateNextPayDate(debt) ?? '-',
    amount: getDisplayAmount(debt),
    currency: 'BRL',
    status: debtStatus(debt),
    canConfirm: false,
    canDelete: false,
    canCopy: false,
  }))
}

export function mapPublicGroupParticipantsToVM(input: Array<ParticipantResponse & { is_host?: boolean }>): DebtListItemVM[] {
  return input.map((p, index) => ({
    id: `${p.friend_id ?? 'host'}-${index}`,
    title: p.name && p.name.trim().length > 0 ? p.name : (p.friend_id === null ? 'Host' : `Participant ${index + 1}`),
    subtitle: p.is_host ? 'Host' : 'Participant',
    amount: p.share_amount,
    currency: 'BRL',
    status: { label: p.is_confirmed ? 'Confirmed' : 'Pending', tone: p.is_confirmed ? 'default' : 'outline' },
    canConfirm: false,
    canDelete: false,
    canCopy: false,
  }))
}

export function mapHostedGroupParticipantsToVM(group: PublicFriendGroupResponse & { participants: Array<{ friend_id: string; friend_name: string; share_amount: number; is_confirmed: boolean }> }): DebtListItemVM[] {
  return group.participants.map((p) => ({
    id: `${group.event_id}-${p.friend_id}`,
    title: p.friend_name,
    subtitle: group.title,
    amount: p.share_amount,
    currency: 'BRL',
    status: { label: p.is_confirmed ? 'Confirmed' : 'Pending', tone: p.is_confirmed ? 'default' : 'outline' },
    canConfirm: true,
    canDelete: false,
    canCopy: false,
  }))
}
