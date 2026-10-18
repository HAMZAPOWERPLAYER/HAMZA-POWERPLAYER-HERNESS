import { describe, expect, it } from 'vitest'
import {
  assessCommandRisk,
  commandRiskExplanation,
  isCommandAllowed,
  type CommandRiskAssessment,
} from '../src/command-safety.ts'
import { createCommandPlan } from '../src/command-plan.ts'

describe('assessCommandRisk', () => {
  it('scores a safe command as low with no reasons', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['status']))
    expect(assessment.score).toBe(0)
    expect(assessment.level).toBe('low')
    expect(assessment.reasons).toEqual([])
    expect(assessment.reasons).toHaveLength(0)
  })

  it('returns readonly-shaped assessment fields', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['status']))
    expect(assessment.score).toBeGreaterThanOrEqual(0)
  })

  it('flags an unsafe executable name (reason 1)', () => {
    const assessment = assessCommandRisk(createCommandPlan('git;rm', ['status']))
    expect(assessment.reasons).toEqual(['executable is not on the safe-name list'])
    expect(assessment.reasons).toHaveLength(1)
    expect(assessment.score).toBe(40)
    expect(assessment.level).toBe('high')
  })

  it('flags a metacharacter in an argument (reason 2)', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['status;rm']))
    expect(assessment.reasons).toEqual(['argument contains a shell metacharacter'])
    expect(assessment.score).toBe(30)
    expect(assessment.level).toBe('medium')
  })

  it('detects each metacharacter variant', () => {
    for (const character of [';', '&', '|', '<', '>', '`', '$', '\n']) {
      const assessment = assessCommandRisk(createCommandPlan('git', [`a${character}b`]))
      expect(assessment.reasons).toContain('argument contains a shell metacharacter')
    }
  })

  it('records the metacharacter reason at most once', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['a;b', 'c|d']))
    expect(assessment.reasons).toHaveLength(1)
  })

  it('flags a path traversal argument (reason 3)', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['../secret']))
    expect(assessment.reasons).toEqual(['argument contains a path traversal'])
    expect(assessment.score).toBe(20)
    expect(assessment.level).toBe('medium')
  })

  it('detects traversal in a middle segment', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['foo/../bar']))
    expect(assessment.reasons).toContain('argument contains a path traversal')
  })

  it('detects traversal with backslash separators', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['foo\\..\\bar']))
    expect(assessment.reasons).toContain('argument contains a path traversal')
  })

  it('does not flag traversal when dots are not a whole segment', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['a..b']))
    expect(assessment.reasons).not.toContain('argument contains a path traversal')
  })

  it('flags an absolute path argument (reason 4)', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['/etc/passwd']))
    expect(assessment.reasons).toEqual(['argument contains an absolute path'])
    expect(assessment.score).toBe(10)
    expect(assessment.level).toBe('low')
  })

  it('flags a drive-letter absolute path', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['C:\\Windows\\system32']))
    expect(assessment.reasons).toContain('argument contains an absolute path')
  })

  it('flags an unusually long argument (reason 5)', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['a'.repeat(4097)]))
    expect(assessment.reasons).toEqual(['argument is unusually long'])
    expect(assessment.score).toBe(5)
    expect(assessment.level).toBe('low')
  })

  it('does not flag an argument of exactly 4096 characters', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['a'.repeat(4096)]))
    expect(assessment.reasons).not.toContain('argument is unusually long')
  })

  it('combines multiple reasons in order', () => {
    const assessment = assessCommandRisk(
      createCommandPlan('git;rm', ['../x', '/abs', 'a'.repeat(4097), 'b;c']),
    )
    expect(assessment.reasons).toEqual([
      'executable is not on the safe-name list',
      'argument contains a shell metacharacter',
      'argument contains a path traversal',
      'argument contains an absolute path',
      'argument is unusually long',
    ])
    expect(assessment.score).toBe(105)
    expect(assessment.level).toBe('critical')
  })

  it('keeps reason order even when only later reasons trigger', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['/abs']))
    expect(assessment.reasons).toEqual(['argument contains an absolute path'])
  })

  it('treats a traversal argument that is not a metacharacter as reason 3 only', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['../not-meta']))
    expect(assessment.reasons).toEqual(['argument contains a path traversal'])
    expect(assessment.reasons).not.toContain('argument contains a shell metacharacter')
  })

  it('maps score 0 to low', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['status']))
    expect(assessment.score).toBe(0)
    expect(assessment.level).toBe('low')
  })

  it('maps score 20 to medium', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['../x']))
    expect(assessment.score).toBe(20)
    expect(assessment.level).toBe('medium')
  })

  it('maps score 39-range (35) to medium', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['a;b', 'a'.repeat(4097)]))
    expect(assessment.score).toBe(35)
    expect(assessment.level).toBe('medium')
  })

  it('maps score 40 to high', () => {
    const assessment = assessCommandRisk(createCommandPlan('git;rm', ['status']))
    expect(assessment.score).toBe(40)
    expect(assessment.level).toBe('high')
  })

  it('maps score 55 to high', () => {
    const assessment = assessCommandRisk(createCommandPlan('git;rm', ['/abs', 'a'.repeat(4097)]))
    expect(assessment.score).toBe(55)
    expect(assessment.level).toBe('high')
  })

  it('maps score 60 to critical', () => {
    const assessment = assessCommandRisk(createCommandPlan('git;rm', ['../x']))
    expect(assessment.score).toBe(60)
    expect(assessment.level).toBe('critical')
  })
})

describe('commandRiskExplanation', () => {
  it('renders the empty-reasons branch', () => {
    const assessment: CommandRiskAssessment = { score: 0, level: 'low', reasons: [] }
    expect(commandRiskExplanation(assessment)).toBe('command risk: low (no risk factors)')
  })

  it('renders reasons joined by semicolons', () => {
    const assessment: CommandRiskAssessment = {
      score: 70,
      level: 'critical',
      reasons: ['executable is not on the safe-name list', 'argument contains a shell metacharacter'],
    }
    expect(commandRiskExplanation(assessment)).toBe(
      'command risk: critical (executable is not on the safe-name list; argument contains a shell metacharacter)',
    )
  })

  it('uses the assessment level', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['/abs']))
    expect(commandRiskExplanation(assessment)).toMatch(/^command risk: low \(/)
  })
})

describe('isCommandAllowed', () => {
  it('allows equal ranks', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['status']))
    expect(isCommandAllowed(assessment, 'low')).toBe(true)
  })

  it('allows lower severity under higher maximum', () => {
    const assessment = assessCommandRisk(createCommandPlan('git', ['../x']))
    expect(isCommandAllowed(assessment, 'high')).toBe(true)
  })

  it('rejects higher severity than maximum', () => {
    const assessment = assessCommandRisk(createCommandPlan('git;rm', ['status']))
    expect(isCommandAllowed(assessment, 'medium')).toBe(false)
  })

  it('rejects critical under high', () => {
    const assessment = assessCommandRisk(createCommandPlan('git;rm', ['../x']))
    expect(isCommandAllowed(assessment, 'high')).toBe(false)
  })

  it('allows critical under critical', () => {
    const assessment = assessCommandRisk(createCommandPlan('git;rm', ['../x']))
    expect(isCommandAllowed(assessment, 'critical')).toBe(true)
  })
})
