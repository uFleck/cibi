import { addDays, addMonths } from '../dates'
import { FREQ_WEEKLY } from './engine'

/**
 * Returns the next installment due date from the first due date, the number of
 * installments already paid, and the frequency. Weekly adds 7-day steps; any other
 * frequency adds calendar months (month-end overflow follows AddDate, see addMonths).
 */
export function nextInstallmentDue(firstDue: Date, paidInstallments: number, frequency: string): Date {
  switch (frequency) {
    case FREQ_WEEKLY:
      return addDays(firstDue, paidInstallments * 7)
    default:
      return addMonths(firstDue, paidInstallments)
  }
}
