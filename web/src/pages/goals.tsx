import { useContext, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AccountContext } from '@/App'
import { fetchAccounts, listGoals, createGoal, addGoalLedgerEntry, reverseGoalLedgerEntry } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'

export function GoalsPage() {
  const { selectedAccountId } = useContext(AccountContext)
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState('')

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const accountId = selectedAccountId || accounts[0]?.id
  const currency = accounts.find(a => a.id === accountId)?.currency ?? 'BRL'

  const { data: goals = [] } = useQuery({ queryKey: ['goals', accountId], queryFn: () => listGoals(accountId), enabled: !!accountId })

  const createMut = useMutation({
    mutationFn: () => createGoal({ account_id: accountId, name, target_amount: Number(target), start_date_utc: new Date().toISOString() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); setName(''); setTarget(''); toast.success('Goal created') },
    onError: (e: Error) => toast.error(e.message),
  })

  const addMut = useMutation({
    mutationFn: (goalId: string) => addGoalLedgerEntry(goalId, { amount: Number(amount), type: 'contribution', source: 'manual' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); setAmount(''); toast.success('Contribution added') },
    onError: (e: Error & { code?: string }) => toast.error(e.code ? `${e.code}: ${e.message}` : e.message),
  })

  return <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-3">
    <h1 className="text-xl font-semibold">Goals</h1>
    <div className="flex gap-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Goal name" className="border rounded px-2 py-1" />
      <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target amount" className="border rounded px-2 py-1" />
      <Button onClick={() => createMut.mutate()} disabled={!accountId || !name || !target}>Create</Button>
    </div>
    <div className="flex gap-2">
      <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Contribution" className="border rounded px-2 py-1" />
    </div>
    {goals.map(g => <div key={g.id} className="border rounded p-3 flex justify-between items-center">
      <div>
        <div className="font-medium">{g.name} ({g.status})</div>
        <div className="text-sm text-muted-foreground">{formatMoney(g.invested_total, currency)} / {formatMoney(g.target_amount, currency)}</div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => addMut.mutate(g.id)} disabled={!amount}>Contribute</Button>
        <Button size="sm" variant="secondary" onClick={() => reverseGoalLedgerEntry(g.id, 'latest').catch(() => undefined)}>Reverse</Button>
      </div>
    </div>)}
  </div>
}
