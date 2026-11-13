import { addDays, addMonths } from '../dates'
import { FREQ_BI_WEEKLY, FREQ_WEEKLY, FREQ_YEARLY } from './engine'

/**
 * Returns the next installment due date from the first due date, the number of
 * installments already paid, and the frequency. Weekly and bi-weekly add 7/14-day
 * steps, yearly adds 12 months, and any other frequency adds calendar months
 * (month-end overflow follows AddDate, see addMonths).
 */
export function nextInstallmentDue(firstDue: Date, paidInstallments: number, frequency: string): Date {
  switch (frequency) {
    case FREQ_WEEKLY:
      return addDays(firstDue, paidInstallments * 7)
    case FREQ_BI_WEEKLY:
      return addDays(firstDue, paidInstallments * 14)
    case FREQ_YEARLY:
      return addMonths(firstDue, paidInstallments * 12)
    default:
      return addMonths(firstDue, paidInstallments)
  }
}
