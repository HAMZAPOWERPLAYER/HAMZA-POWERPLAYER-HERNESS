import { describe, expect, it } from 'vitest'
import {
  RISK_LEVEL_RANK,
  compareRisk,
  isHighRisk,
  maxRisk,
  requiresApproval,
  riskLabel,
  type RiskLevel,
} from '../src/tool-risk.ts'

const ALL: readonly RiskLevel[] = ['low', 'medium', 'high', 'critical']

describe('RISK_LEVEL_RANK', () => {
  it('maps every level to its rank', () => {
    expect(RISK_LEVEL_RANK).toEqual({ low: 0, medium: 1, high: 2, critical: 3 })
  })
})

describe('compareRisk', () => {
  it('returns 0 for equal levels', () => {
    for (const level of ALL) {
      expect(compareRisk(level, level)).toBe(0)
    }
  })
  it('returns negative when a is less severe', () => {
    expect(compareRisk('low', 'high')).toBeLessThan(0)
    expect(compareRisk('medium', 'critical')).toBeLessThan(0)
  })
  it('returns positive when a is more severe', () => {
    expect(compareRisk('critical', 'low')).toBeGreaterThan(0)
    expect(compareRisk('high', 'medium')).toBeGreaterThan(0)
  })
  it('equals rank difference', () => {
    expect(compareRisk('high', 'low')).toBe(RISK_LEVEL_RANK.high - RISK_LEVEL_RANK.low)
  })
})

describe('isHighRisk', () => {
  it('true only for high and critical', () => {
    expect(isHighRisk('low')).toBe(false)
    expect(isHighRisk('medium')).toBe(false)
    expect(isHighRisk('high')).toBe(true)
    expect(isHighRisk('critical')).toBe(true)
  })
})

describe('requiresApproval', () => {
  it('true only for high and critical', () => {
    expect(requiresApproval('low')).toBe(false)
    expect(requiresApproval('medium')).toBe(false)
    expect(requiresApproval('high')).toBe(true)
    expect(requiresApproval('critical')).toBe(true)
  })
})

describe('maxRisk', () => {
  it('returns low for empty', () => {
    expect(maxRisk([])).toBe('low')
  })
  it('returns the highest level', () => {
    expect(maxRisk(['low', 'medium'])).toBe('medium')
    expect(maxRisk(['high', 'low', 'critical', 'medium'])).toBe('critical')
    expect(maxRisk(['low'])).toBe('low')
  })
  it('handles single critical', () => {
    expect(maxRisk(['critical'])).toBe('critical')
  })
})

describe('riskLabel', () => {
  it('capitalizes first letter', () => {
    expect(riskLabel('low')).toBe('Low risk')
    expect(riskLabel('medium')).toBe('Medium risk')
    expect(riskLabel('high')).toBe('High risk')
    expect(riskLabel('critical')).toBe('Critical risk')
  })
})
