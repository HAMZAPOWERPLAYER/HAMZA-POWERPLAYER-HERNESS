import { describe, expect, it } from 'vitest'
import { evaluateCoverageGate, fileMeetsThresholds, formatFileCoverage } from '../src/test-coverage-gate.ts'

describe('fileMeetsThresholds', () => {
  const t = { statements: 100, branches: 100, functions: 100, lines: 100 }
  it('passes when every metric meets the threshold', () => {
    expect(fileMeetsThresholds({ path: 'a.ts', statements: 100, branches: 100, functions: 100, lines: 100 }, t)).toBe(true)
  })
  it('fails when one metric is below', () => {
    expect(fileMeetsThresholds({ path: 'a.ts', statements: 99, branches: 100, functions: 100, lines: 100 }, t)).toBe(false)
  })
  it('passes at the exact boundary', () => {
    expect(fileMeetsThresholds({ path: 'a.ts', statements: 80, branches: 80, functions: 80, lines: 80 }, { statements: 80, branches: 80, functions: 80, lines: 80 })).toBe(true)
  })
})

describe('evaluateCoverageGate', () => {
  const t = { statements: 100, branches: 100, functions: 100, lines: 100 }
  it('passes when all files meet thresholds', () => {
    const r = evaluateCoverageGate([{ path: 'a.ts', statements: 100, branches: 100, functions: 100, lines: 100 }], t)
    expect(r.passed).toBe(true)
    expect(r.failingFiles).toEqual([])
    expect(r.summary).toBe('coverage gate passed: 1 file(s)')
  })
  it('fails with sorted failing files', () => {
    const r = evaluateCoverageGate([
      { path: 'b.ts', statements: 90, branches: 100, functions: 100, lines: 100 },
      { path: 'a.ts', statements: 80, branches: 100, functions: 100, lines: 100 },
    ], t)
    expect(r.passed).toBe(false)
    expect(r.failingFiles).toEqual(['a.ts', 'b.ts'])
    expect(r.summary).toBe('coverage gate failed: 2 of 2 file(s)')
  })
  it('fails when no files are supplied', () => {
    const r = evaluateCoverageGate([], t)
    expect(r.passed).toBe(false)
    expect(r.failingFiles).toEqual([])
    expect(r.summary).toBe('coverage gate failed: no files supplied')
  })
  it('passes with partial thresholds', () => {
    const r = evaluateCoverageGate([{ path: 'a.ts', statements: 80, branches: 70, functions: 90, lines: 85 }], { statements: 80, branches: 70, functions: 90, lines: 85 })
    expect(r.passed).toBe(true)
  })
})

describe('formatFileCoverage', () => {
  it('renders a coverage line', () => {
    expect(formatFileCoverage({ path: 'a.ts', statements: 100, branches: 90, functions: 80, lines: 95 })).toBe('a.ts: statements=100% branches=90% functions=80% lines=95%')
  })
})
