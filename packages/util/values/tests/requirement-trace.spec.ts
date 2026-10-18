import { describe, expect, it } from 'vitest'
import {
  createRequirementTrace,
  deriveRequirementStatus,
  isTerminalRequirementStatus,
  linkChange,
  linkClaim,
  linkEvidence,
  linkTask,
  linkTest,
  updateRequirementStatus,
  type ClaimEvaluation,
  type RequirementStatus,
  type RequirementTrace,
} from '../src/requirement-trace.ts'

const claim = (claimId: string, state: 'verified' | 'partially-verified' | 'unverified' | 'failed'): ClaimEvaluation => ({
  claimId,
  claimText: `claim ${claimId}`,
  state,
  satisfiedTypes: [],
  missingTypes: [],
  strongestCategory: 'verified-command',
  isFactGrade: state === 'verified',
  explanation: 'e',
})

describe('createRequirementTrace', () => {
  it('creates a trace with empty artifact lists and not-started status', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'the project compiles' })
    expect(trace.id).toBe('r-1')
    expect(trace.description).toBe('the project compiles')
    expect(trace.status).toBe('not-started')
    expect(trace.linkedTaskIds).toEqual([])
    expect(trace.linkedChangeIds).toEqual([])
    expect(trace.linkedTestIds).toEqual([])
    expect(trace.linkedEvidenceIds).toEqual([])
    expect(trace.linkedClaimIds).toEqual([])
  })

  it('honours supplied fields', () => {
    const trace = createRequirementTrace({
      id: 'r-1',
      description: 'd',
      status: 'in-progress',
      linkedTaskIds: ['t-1'],
      blockedReason: 'missing sdk',
    })
    expect(trace.status).toBe('in-progress')
    expect(trace.linkedTaskIds).toEqual(['t-1'])
    expect(trace.blockedReason).toBe('missing sdk')
  })
})

describe('linkTask / linkChange / linkTest / linkEvidence / linkClaim', () => {
  it('adds each artifact kind once and deduplicates', () => {
    let trace = createRequirementTrace({ id: 'r-1', description: 'd' })
    trace = linkTask(trace, 't-1')
    trace = linkTask(trace, 't-1') // duplicate ignored
    trace = linkChange(trace, 'src/a.ts')
    trace = linkTest(trace, 'test-1')
    trace = linkEvidence(trace, 'ev-1')
    trace = linkClaim(trace, 'c-1')
    expect(trace.linkedTaskIds).toEqual(['t-1'])
    expect(trace.linkedChangeIds).toEqual(['src/a.ts'])
    expect(trace.linkedTestIds).toEqual(['test-1'])
    expect(trace.linkedEvidenceIds).toEqual(['ev-1'])
    expect(trace.linkedClaimIds).toEqual(['c-1'])
  })

  it('does not mutate the input trace', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd' })
    const updated = linkTask(trace, 't-1')
    expect(updated).not.toBe(trace)
    expect(trace.linkedTaskIds).toEqual([])
  })
})

describe('updateRequirementStatus', () => {
  it('updates status and clears reasons for non-blocked/deferred', () => {
    let trace = createRequirementTrace({ id: 'r-1', description: 'd', status: 'blocked', blockedReason: 'old' })
    trace = updateRequirementStatus(trace, 'in-progress')
    expect(trace.status).toBe('in-progress')
    expect(trace.blockedReason).toBeUndefined()
    expect(trace.deferredReason).toBeUndefined()
  })

  it('requires a reason for blocked', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd' })
    expect(() => updateRequirementStatus(trace, 'blocked')).toThrow()
  })

  it('requires a reason for deferred', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd' })
    expect(() => updateRequirementStatus(trace, 'deferred')).toThrow()
  })

  it('sets blocked reason', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd' })
    const updated = updateRequirementStatus(trace, 'blocked', 'sdk missing')
    expect(updated.status).toBe('blocked')
    expect(updated.blockedReason).toBe('sdk missing')
    expect(updated.deferredReason).toBeUndefined()
  })

  it('sets deferred reason', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd' })
    const updated = updateRequirementStatus(trace, 'deferred', 'post-release')
    expect(updated.status).toBe('deferred')
    expect(updated.deferredReason).toBe('post-release')
    expect(updated.blockedReason).toBeUndefined()
  })
})

describe('deriveRequirementStatus', () => {
  it('returns tested-with-failures when any linked claim failed', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd', linkedClaimIds: ['c-1', 'c-2'] })
    const status = deriveRequirementStatus(trace, [claim('c-1', 'verified'), claim('c-2', 'failed')])
    expect(status).toBe('tested-with-failures')
  })

  it('returns verified-within-scope when all linked claims verified', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd', linkedClaimIds: ['c-1', 'c-2'] })
    const status = deriveRequirementStatus(trace, [claim('c-1', 'verified'), claim('c-2', 'verified')])
    expect(status).toBe('verified-within-scope')
  })

  it('returns partially-verified when any claim verified or partially verified', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd', linkedClaimIds: ['c-1'] })
    expect(deriveRequirementStatus(trace, [claim('c-1', 'partially-verified')])).toBe('partially-verified')
    expect(deriveRequirementStatus(trace, [claim('c-1', 'verified')])).toBe('verified-within-scope')
  })

  it('returns implemented-but-untested when claims are unverified', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd', linkedClaimIds: ['c-1'] })
    const status = deriveRequirementStatus(trace, [claim('c-1', 'unverified')])
    expect(status).toBe('implemented-but-untested')
  })

  it('keeps existing status when no linked claims are evaluated', () => {
    const trace = createRequirementTrace({ id: 'r-1', description: 'd', status: 'in-progress', linkedClaimIds: ['c-1'] })
    const status = deriveRequirementStatus(trace, [claim('c-9', 'verified')])
    expect(status).toBe('in-progress')
  })

  it('honours blocked reason over claims', () => {
    const trace = createRequirementTrace({
      id: 'r-1', description: 'd', status: 'verified-within-scope', linkedClaimIds: ['c-1'], blockedReason: 'sdk missing',
    })
    const status = deriveRequirementStatus(trace, [claim('c-1', 'verified')])
    expect(status).toBe('blocked')
  })

  it('honours deferred reason over claims', () => {
    const trace = createRequirementTrace({
      id: 'r-1', description: 'd', linkedClaimIds: ['c-1'], deferredReason: 'post-release',
    })
    const status = deriveRequirementStatus(trace, [claim('c-1', 'verified')])
    expect(status).toBe('deferred')
  })
})

describe('isTerminalRequirementStatus', () => {
  it.each([['verified-within-scope'], ['tested-with-failures'], ['deferred']])('reports %s as terminal', (status) => {
    expect(isTerminalRequirementStatus(status as RequirementStatus)).toBe(true)
  })
  it.each([['not-started'], ['in-progress'], ['implemented-but-untested'], ['partially-verified'], ['blocked']])(
    'reports %s as non-terminal',
    (status) => {
      expect(isTerminalRequirementStatus(status as RequirementStatus)).toBe(false)
    },
  )
})
