import { describe, expect, it } from 'vitest'
import { formatTestRunSummary, isUnityRunGreen, parseFailedTests, parseTestRunSummary } from '../src/unity-test-results.ts'

describe('parseTestRunSummary', () => {
  it('reads a realistic report', () => {
    const xml = '<test-run total="10" passed="8" failed="1" skipped="1" inconclusive="0" duration="12.5" result="Failed"></test-run>'
    const s = parseTestRunSummary(xml)
    expect(s.total).toBe(10)
    expect(s.passed).toBe(8)
    expect(s.failed).toBe(1)
    expect(s.skipped).toBe(1)
    expect(s.inconclusive).toBe(0)
    expect(s.durationSeconds).toBe(12.5)
    expect(s.result).toBe('Failed')
  })

  it('returns zeros and nulls when attributes are absent', () => {
    const s = parseTestRunSummary('<test-run></test-run>')
    expect(s.total).toBe(0)
    expect(s.passed).toBe(0)
    expect(s.failed).toBe(0)
    expect(s.skipped).toBe(0)
    expect(s.inconclusive).toBe(0)
    expect(s.durationSeconds).toBeNull()
    expect(s.result).toBeNull()
  })

  it('returns zeros when the test-run element is absent', () => {
    const s = parseTestRunSummary('<foo></foo>')
    expect(s.total).toBe(0)
    expect(s.result).toBeNull()
  })

  it('reads attributes in any order', () => {
    const xml = '<test-run result="Passed" duration="1" total="2" passed="2" failed="0" skipped="0" inconclusive="0"></test-run>'
    const s = parseTestRunSummary(xml)
    expect(s.total).toBe(2)
    expect(s.result).toBe('Passed')
    expect(s.durationSeconds).toBe(1)
  })

  it('treats non-numeric counts as zero', () => {
    const s = parseTestRunSummary('<test-run total="abc" passed="x" failed="1" skipped="0" inconclusive="0"></test-run>')
    expect(s.total).toBe(0)
    expect(s.passed).toBe(0)
    expect(s.failed).toBe(1)
  })

  it('truncates fractional counts', () => {
    const s = parseTestRunSummary('<test-run total="10.9" passed="8.2" failed="0" skipped="0" inconclusive="0"></test-run>')
    expect(s.total).toBe(10)
    expect(s.passed).toBe(8)
  })

  it('returns null duration for an invalid value', () => {
    const s = parseTestRunSummary('<test-run duration="abc"></test-run>')
    expect(s.durationSeconds).toBeNull()
  })

  it('reads duration as a finite number', () => {
    const s = parseTestRunSummary('<test-run duration="3.25"></test-run>')
    expect(s.durationSeconds).toBe(3.25)
  })
})

describe('parseFailedTests', () => {
  it('extracts failed tests with CDATA messages', () => {
    const xml = [
      '<test-run>',
      '  <test-case name="A" fullname="N.A" result="Failed"><message><![CDATA[boom]]></message></test-case>',
      '  <test-case name="B" result="Passed"></test-case>',
      '</test-run>',
    ].join('\n')
    const f = parseFailedTests(xml)
    expect(f).toHaveLength(1)
    expect(f[0]!.name).toBe('A')
    expect(f[0]!.fullname).toBe('N.A')
    expect(f[0]!.message).toBe('boom')
  })

  it('extracts plain messages', () => {
    const xml = '<test-case name="A" result="Failed"><message>plain</message></test-case>'
    const f = parseFailedTests(xml)
    expect(f[0]!.message).toBe('plain')
  })

  it('trims and strips a single leading/trailing newline from messages', () => {
    const xml = '<test-case name="A" result="Failed"><message>\nline1\nline2\n</message></test-case>'
    const f = parseFailedTests(xml)
    expect(f[0]!.message).toBe('line1\nline2')
  })

  it('returns null message when none is present', () => {
    const xml = '<test-case name="A" result="Failed"></test-case>'
    const f = parseFailedTests(xml)
    expect(f[0]!.message).toBeNull()
  })

  it('omits fullname when absent', () => {
    const xml = '<test-case name="A" result="Failed"></test-case>'
    const f = parseFailedTests(xml)
    expect(f[0]!.fullname).toBeNull()
  })

  it('preserves document order and de-duplicates', () => {
    const xml = [
      '<test-case name="A" result="Failed"></test-case>',
      '<test-case name="A" result="Failed"></test-case>',
      '<test-case name="B" result="Failed"></test-case>',
    ].join('')
    const f = parseFailedTests(xml)
    expect(f).toHaveLength(2)
    expect(f[0]!.name).toBe('A')
    expect(f[1]!.name).toBe('B')
  })

  it('ignores non-failed test cases', () => {
    const xml = '<test-case name="A" result="Passed"></test-case><test-case name="B" result="Skipped"></test-case>'
    const f = parseFailedTests(xml)
    expect(f).toHaveLength(0)
  })

  it('ignores test cases without a name', () => {
    const xml = '<test-case result="Failed"></test-case>'
    const f = parseFailedTests(xml)
    expect(f).toHaveLength(0)
  })
})

describe('formatTestRunSummary', () => {
  it('formats a full summary', () => {
    const s = parseTestRunSummary('<test-run total="10" passed="8" failed="1" skipped="1" inconclusive="0" duration="12.5" result="Failed"></test-run>')
    expect(formatTestRunSummary(s)).toBe('total=10 passed=8 failed=1 skipped=1 inconclusive=0 duration=12.5s result=Failed')
  })

  it('uses unknown for absent duration and result', () => {
    const s = parseTestRunSummary('<test-run total="0"></test-run>')
    expect(formatTestRunSummary(s)).toBe('total=0 passed=0 failed=0 skipped=0 inconclusive=0 duration=unknowns result=unknown')
  })
})

describe('isUnityRunGreen', () => {
  it('is true only for a passing non-empty run', () => {
    const s = parseTestRunSummary('<test-run total="2" passed="2" failed="0" skipped="0" inconclusive="0" result="Passed"></test-run>')
    expect(isUnityRunGreen(s)).toBe(true)
  })

  it('is false for an empty run', () => {
    const s = parseTestRunSummary('<test-run total="0" result="Passed"></test-run>')
    expect(isUnityRunGreen(s)).toBe(false)
  })

  it('is false when one test failed', () => {
    const s = parseTestRunSummary('<test-run total="2" passed="1" failed="1" skipped="0" inconclusive="0" result="Passed"></test-run>')
    expect(isUnityRunGreen(s)).toBe(false)
  })

  it('is false when one test is inconclusive', () => {
    const s = parseTestRunSummary('<test-run total="2" passed="1" failed="0" skipped="0" inconclusive="1" result="Passed"></test-run>')
    expect(isUnityRunGreen(s)).toBe(false)
  })

  it('is false when the result is not Passed', () => {
    const s = parseTestRunSummary('<test-run total="2" passed="2" failed="0" skipped="0" inconclusive="0" result="Failed"></test-run>')
    expect(isUnityRunGreen(s)).toBe(false)
  })
})
