import { describe, expect, it } from 'vitest'
import {
  coverageGateChecks,
  claimSupportCheck,
  evaluateGameQualityGate,
  QUALITY_CATEGORIES,
  QUALITY_GATE_CHECKLIST,
  QUALITY_GATE_SUBSTITUTE_FOR_TESTS,
  securityAuditChecks,
  type QualityCategory,
  type QualityCategoryInput,
  type QualityCheck,
  type QualityCheckStatus,
} from '../src/game-quality-gate.ts'

function passingInputs(): QualityCategoryInput[] {
  return QUALITY_CATEGORIES.map((category): QualityCategoryInput => ({
    category,
    checks: [
      { id: `${category}/q1`, question: `Does ${category} satisfy its first rule?`, status: 'pass' },
      { id: `${category}/q2`, question: `Does ${category} satisfy its second rule?`, status: 'not-applicable' },
    ],
  }))
}

function withCheck(category: QualityCategory, check: QualityCheck): QualityCategoryInput[] {
  return passingInputs().map((input): QualityCategoryInput =>
    input.category === category ? { category, checks: [...input.checks, check] } : input,
  )
}

describe('evaluateGameQualityGate', () => {
  it('passes when every check passes or is not applicable', () => {
    const verdict = evaluateGameQualityGate(passingInputs())
    expect(verdict.overallStatus).toBe('pass')
    expect(verdict.results.map((result) => result.category)).toEqual([...QUALITY_CATEGORIES])
    expect(verdict.results.map((result) => result.status)).toEqual(
      QUALITY_CATEGORIES.map(() => 'pass'),
    )
    expect(verdict.failures).toEqual([])
    expect(verdict.notRun).toEqual([])
    expect(verdict.substituteForTests).toBe(false)
    expect(verdict.substituteForTests).toBe(QUALITY_GATE_SUBSTITUTE_FOR_TESTS)
  })

  it('fails when any check fails', () => {
    const verdict = evaluateGameQualityGate(
      withCheck('security', {
        id: 'security/leak',
        question: 'Is the key redacted?',
        status: 'fail',
        evidence: 'secret-leakage: plaintext key',
      }),
    )
    expect(verdict.overallStatus).toBe('fail')
    expect(verdict.failures).toEqual([
      {
        category: 'security',
        checkId: 'security/leak',
        question: 'Is the key redacted?',
        evidence: 'secret-leakage: plaintext key',
      },
    ])
    expect(verdict.notRun).toEqual([])
    const security = verdict.results.find((result) => result.category === 'security')
    expect(security?.status).toBe('fail')
  })

  it('reports fail over blocked when a category has both', () => {
    const inputs = passingInputs().map((input): QualityCategoryInput =>
      input.category === 'testing'
        ? {
            category: 'testing',
            checks: [
              { id: 'testing/a', question: 'Were unit tests added?', status: 'fail' },
              { id: 'testing/b', question: 'Was the snapshot updated?', status: 'not-run' },
            ],
          }
        : input,
    )
    const verdict = evaluateGameQualityGate(inputs)
    expect(verdict.overallStatus).toBe('fail')
    expect(verdict.failures).toHaveLength(1)
    expect(verdict.notRun).toHaveLength(1)
    const testing = verdict.results.find((result) => result.category === 'testing')
    expect(testing?.status).toBe('fail')
  })

  it('blocks when a check has not run', () => {
    const verdict = evaluateGameQualityGate(
      withCheck('performance', {
        id: 'performance/frame',
        question: 'Was the frame time measured?',
        status: 'not-run',
      }),
    )
    expect(verdict.overallStatus).toBe('blocked')
    expect(verdict.failures).toEqual([])
    expect(verdict.notRun).toEqual([
      {
        category: 'performance',
        checkId: 'performance/frame',
        question: 'Was the frame time measured?',
      },
    ])
    const performance = verdict.results.find((result) => result.category === 'performance')
    expect(performance?.status).toBe('blocked')
  })

  it('synthesizes a not-run check for a missing category', () => {
    const verdict = evaluateGameQualityGate(
      passingInputs().filter((input) => input.category !== 'testing'),
    )
    expect(verdict.overallStatus).toBe('blocked')
    expect(verdict.results.map((result) => result.category)).toEqual([...QUALITY_CATEGORIES])
    expect(verdict.notRun).toHaveLength(1)
    const testing = verdict.results.find((result) => result.category === 'testing')
    expect(testing?.status).toBe('blocked')
    expect(testing?.checks.at(0)).toEqual({
      id: 'testing/input-supplied',
      question: 'Were the testing checks run and recorded?',
      status: 'not-run',
      evidence: 'no testing input supplied',
    })
  })

  it('synthesizes a not-run check for a category supplied without checks', () => {
    const inputs = passingInputs().map((input): QualityCategoryInput =>
      input.category === 'maintainability'
        ? { category: input.category, checks: [] }
        : input,
    )
    const verdict = evaluateGameQualityGate(inputs)
    expect(verdict.overallStatus).toBe('blocked')
    expect(verdict.notRun).toHaveLength(1)
    const maintainability = verdict.results.find(
      (result) => result.category === 'maintainability',
    )
    expect(maintainability?.checks).toHaveLength(1)
    expect(maintainability?.checks.at(0)?.evidence).toBe(
      'maintainability input supplied without checks',
    )
  })

  it('throws on an unknown category', () => {
    const unrecognized: string = 'bogus'
    expect(() =>
      evaluateGameQualityGate([{ category: unrecognized as QualityCategory, checks: [] }]),
    ).toThrow(/unknown quality category: bogus/)
  })

  it('throws on a duplicate category', () => {
    const build = (): QualityCategoryInput => ({
      category: 'architecture',
      checks: [{ id: 'architecture/q1', question: 'Is it owned?', status: 'pass' }],
    })
    expect(() => evaluateGameQualityGate([build(), build()])).toThrow(
      /duplicate quality category: architecture/,
    )
  })

  it('counts an unrecognized status as a failure', () => {
    const unrecognized: string = 'bogus'
    const inputs = passingInputs().map((input): QualityCategoryInput =>
      input.category === 'correctness'
        ? {
            category: input.category,
            checks: [
              {
                id: 'correctness/x',
                question: 'Is it correct?',
                status: unrecognized as QualityCheckStatus,
              },
            ],
          }
        : input,
    )
    const verdict = evaluateGameQualityGate(inputs)
    expect(verdict.overallStatus).toBe('fail')
    expect(verdict.failures).toHaveLength(1)
    expect(verdict.notRun).toEqual([])
  })

  it('orders results and findings canonically regardless of input order', () => {
    const inputs = passingInputs().map((input): QualityCategoryInput =>
      input.category === 'testing' || input.category === 'architecture'
        ? {
            category: input.category,
            checks: [
              { id: `${input.category}/broken`, question: 'Is it sound?', status: 'fail' },
            ],
          }
        : input,
    )
    const forward = evaluateGameQualityGate(inputs)
    const reverse = evaluateGameQualityGate([...inputs].reverse())
    expect(reverse.results.map((result) => result.category)).toEqual([...QUALITY_CATEGORIES])
    expect(reverse.failures.map((finding) => finding.category)).toEqual([
      'architecture',
      'testing',
    ])
    expect(reverse).toEqual(forward)
  })

  it('leaves frozen inputs unchanged and returns fresh check arrays', () => {
    const inputs = passingInputs()
    for (const input of inputs) {
      for (const check of input.checks) Object.freeze(check)
      Object.freeze(input.checks)
      Object.freeze(input)
    }
    const before = JSON.stringify(inputs)
    const verdict = evaluateGameQualityGate(inputs)
    expect(JSON.stringify(inputs)).toBe(before)
    expect(verdict.results.at(0)?.checks).not.toBe(inputs.at(0)?.checks)
  })
})

describe('QUALITY_GATE_CHECKLIST', () => {
  it('covers six categories in canonical order', () => {
    expect(QUALITY_GATE_CHECKLIST).toHaveLength(6)
    expect(QUALITY_GATE_CHECKLIST.map((entry) => entry.category)).toEqual([
      ...QUALITY_CATEGORIES,
    ])
  })

  it('carries four questions per category', () => {
    for (const entry of QUALITY_GATE_CHECKLIST) {
      expect(entry.checks).toHaveLength(4)
    }
  })

  it('has 24 unique, non-empty questions starting as not run', () => {
    const checks = QUALITY_GATE_CHECKLIST.flatMap((entry) => entry.checks)
    expect(checks).toHaveLength(24)
    expect(new Set(checks.map((check) => check.id)).size).toBe(24)
    for (const check of checks) {
      expect(check.question.trim().length).toBeGreaterThan(0)
      expect(check.status).toBe('not-run')
      expect(check.evidence).toBeUndefined()
    }
  })

  it('evaluates to blocked, never pass, when used unfilled', () => {
    const verdict = evaluateGameQualityGate(QUALITY_GATE_CHECKLIST)
    expect(verdict.overallStatus).toBe('blocked')
    expect(verdict.failures).toEqual([])
    expect(verdict.notRun).toHaveLength(24)
    expect(verdict.notRun.at(0)?.category).toBe('architecture')
    expect(verdict.notRun.at(23)?.category).toBe('maintainability')
  })
})

describe('securityAuditChecks', () => {
  it('mirrors each audit result', () => {
    const checks = securityAuditChecks([
      { check: 'path-traversal', passed: true },
      { check: 'secret-leakage', passed: false, reason: 'text contains a potential secret value' },
      { check: 'shell-injection', passed: false },
      { check: 'symlink-escape', passed: true, reason: '' },
    ])
    expect(checks).toHaveLength(4)
    expect(checks.map((check) => check.status)).toEqual(['pass', 'fail', 'fail', 'pass'])
    expect(checks.map((check) => check.id)).toEqual([
      'security-audit/path-traversal',
      'security-audit/secret-leakage',
      'security-audit/shell-injection',
      'security-audit/symlink-escape',
    ])
    expect(checks[1]?.evidence).toBe('text contains a potential secret value')
    expect(checks[2]?.evidence).toBeUndefined()
    expect(checks[3]?.evidence).toBe('')
  })

  it('feeds audit results into the gate', () => {
    const verdict = evaluateGameQualityGate([
      {
        category: 'security',
        checks: securityAuditChecks([
          { check: 'path-traversal', passed: false, reason: 'contains traversal sequence' },
        ]),
      },
    ])
    expect(verdict.overallStatus).toBe('fail')
    expect(verdict.failures).toHaveLength(1)
  })

  it('yields nothing for an empty audit, which the gate blocks', () => {
    const verdict = evaluateGameQualityGate([
      { category: 'security', checks: securityAuditChecks([]) },
    ])
    expect(verdict.overallStatus).toBe('blocked')
    expect(verdict.notRun).toHaveLength(6)
    expect(verdict.notRun.map((finding) => finding.checkId)).toContain(
      'security/input-supplied',
    )
  })
})

describe('coverageGateChecks', () => {
  it('mirrors a passing gate with its summary', () => {
    const [check] = coverageGateChecks({
      passed: true,
      failingFiles: [],
      summary: 'coverage gate passed: 12 file(s)',
    })
    expect(check?.id).toBe('test-coverage/gate')
    expect(check?.status).toBe('pass')
    expect(check?.evidence).toBe('coverage gate passed: 12 file(s)')
  })

  it('mirrors a failing gate with its summary', () => {
    const checks = coverageGateChecks({
      passed: false,
      failingFiles: ['src/a.ts'],
      summary: 'coverage gate failed: 1 of 3 file(s)',
    })
    expect(checks.at(0)?.status).toBe('fail')
    expect(checks.at(0)?.evidence).toBe('coverage gate failed: 1 of 3 file(s)')
    const verdict = evaluateGameQualityGate([{ category: 'testing', checks }])
    expect(verdict.overallStatus).toBe('fail')
    expect(verdict.failures.at(0)?.evidence).toBe('coverage gate failed: 1 of 3 file(s)')
  })
})

describe('claimSupportCheck', () => {
  it('passes a claim with fact-grade evidence', () => {
    const check = claimSupportCheck({
      text: 'the suite is green',
      evidence: [{ id: 'e1', category: 'verified-command', subject: 'test run' }],
    })
    expect(check.status).toBe('pass')
    expect(check.evidence).toContain('verified-command')
  })

  it('fails a claim whose evidence records a failed verification', () => {
    const check = claimSupportCheck({
      text: 'the feature works',
      evidence: [
        { id: 'e1', category: 'failed-verification', subject: 'manual test' },
        { id: 'e2', category: 'verified-command', subject: 'typecheck' },
      ],
    })
    expect(check.status).toBe('fail')
    expect(check.evidence).toContain('failed-verification')
  })

  it('leaves weak or absent evidence not run', () => {
    const assumed = claimSupportCheck({
      text: 'the migration succeeded',
      evidence: [{ id: 'e1', category: 'assumed', subject: 'no output inspected' }],
    })
    expect(assumed.status).toBe('not-run')
    const unevidenced = claimSupportCheck({ text: 'done', evidence: [] })
    expect(unevidenced.status).toBe('not-run')
    expect(unevidenced.evidence).toContain('unknown')
  })
})
