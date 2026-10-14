// Ports of internal/service/engine_test.go (3 tests). The Go tests call the unexported buildGoalImpacts
// and build an EngineResult literal; here the same functions are exported from service/engine.ts.
// Not ported: none (the Go file has no skipped stubs; the two Stub tests are in pay_schedule_test.go).
import { describe, expect, it } from 'vitest'
import type { Goal } from '../repo/goals'
import { buildGoalImpacts, type EngineResult } from './engine'

const ACC_ID = '22222222-2222-4222-8222-222222222222'

/** A goal row with the fields the engine reads; the others are the Go zero values. */
function goal(over: Partial<Goal> & Pick<Goal, 'id' | 'name' | 'status'>): Goal {
  return {
    accountId: ACC_ID,
    targetAmountCents: 0,
    investedTotalCents: 0,
    minContributionPerWindowCents: 0,
    startDateUtc: new Date('2026-01-01T00:00:00Z'),
    targetDateUtc: null,
    notes: null,
    currency: 'USD',
    createdAtUtc: new Date('2026-01-01T00:00:00Z'),
    updatedAtUtc: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

describe('engine service', () => {
  it('TestBuildGoalImpacts_UsesMinContributionThreshold', () => {
    const goals: Goal[] = [
      goal({ id: '10000000-0000-4000-8000-000000000001', name: 'Laptop', status: 'active', targetAmountCents: 100000, investedTotalCents: 20000, minContributionPerWindowCents: 5000 }),
      goal({ id: '10000000-0000-4000-8000-000000000002', name: 'Trip', status: 'active', targetAmountCents: 30000, investedTotalCents: 25000, minContributionPerWindowCents: 0 }),
      goal({ id: '10000000-0000-4000-8000-000000000003', name: 'Done', status: 'completed', targetAmountCents: 10000, investedTotalCents: 10000, minContributionPerWindowCents: 3000 }),
    ]

    const { impacts, covered } = buildGoalImpacts(goals, 9000, 3000, new Map())
    expect(covered).toHaveLength(0)
    expect(impacts).toHaveLength(1)
    expect(impacts[0]?.goalName).toBe('Laptop')
    expect(impacts[0]?.remainingBefore).toBe(80000)
    expect(impacts[0]?.remainingAfter).toBe(80000)
    expect(impacts[0]?.progressBeforePct).toBe(impacts[0]?.progressAfterPct)
  })

  it('TestBuildGoalImpacts_SkipsGoalWhenWindowMinAlreadyMet', () => {
    const goalId = '10000000-0000-4000-8000-000000000004'
    const goals: Goal[] = [
      goal({ id: goalId, name: 'Emergency', status: 'active', targetAmountCents: 100000, investedTotalCents: 10000, minContributionPerWindowCents: 5000 }),
    ]

    const { impacts, covered } = buildGoalImpacts(goals, 9000, 1000, new Map([[goalId, 5000]]))
    expect(impacts).toHaveLength(0)
    expect(covered).toHaveLength(1)
    expect(covered[0]?.goalId).toBe(goalId)
    expect(covered[0]?.contributedThisWindowCents).toBe(5000)
    expect(covered[0]?.minContributionPerWindowCents).toBe(5000)
  })

  it('TestEngineResult_WAITSupportsImpactPayload', () => {
    const wait = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const result: EngineResult = {
      canBuy: false,
      purchasingPower: 0,
      bufferRemaining: 0,
      riskLevel: 'WAIT',
      willAffordAfterPayday: true,
      waitUntil: wait,
      goalImpacts: [
        {
          goalId: '10000000-0000-4000-8000-000000000005',
          goalName: 'Emergency Fund',
          remainingBefore: 50000,
          remainingAfter: 40000,
          progressBeforePct: 50,
          progressAfterPct: 60,
          minContributionPerWindowCents: 0,
          severity: 'medium',
        },
      ],
      goalsCoveredThisWindow: [],
    }

    expect(result.riskLevel).toBe('WAIT')
    expect(result.willAffordAfterPayday).toBe(true)
    expect(result.waitUntil).not.toBeNull()
    expect(result.goalImpacts).toHaveLength(1)
  })
})
