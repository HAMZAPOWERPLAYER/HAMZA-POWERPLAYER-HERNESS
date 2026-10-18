import { describe, expect, it } from 'vitest'
import {
  aggregateTestSuite,
  checkSuiteQuality,
  createGameTestCase,
  filterResultsByStatus,
  getFailedTests,
  recordTestResult,
  resolveCheckKind,
} from '../src/index.ts'

const loginParams = {
  id: 'tc-login',
  name: 'Login flow',
  type: 'e2e' as const,
  description: 'User logs in with valid credentials',
  preconditions: ['account exists'],
  steps: ['open app', 'enter credentials', 'submit'],
  expectedResults: ['dashboard shown'],
  automated: true,
  platforms: ['windows', 'linux'],
  estimatedDurationSeconds: 12.5,
  tags: ['smoke', 'auth'],
}

const loginCase = createGameTestCase(loginParams)
const saveCase = createGameTestCase({ ...loginParams, id: 'tc-save', name: 'Save load' })
const combatCase = createGameTestCase({ ...loginParams, id: 'tc-combat', name: 'Combat loop' })
const perfCase = createGameTestCase({ ...loginParams, id: 'tc-perf', name: 'Frame budget' })
const unitCase = createGameTestCase({ ...loginParams, id: 'tc-unit', name: 'Pure rule', type: 'unit' })
const visualCase = createGameTestCase({ ...loginParams, id: 'tc-visual', name: 'Title screen', checkKind: 'visual' })
const buildCase = createGameTestCase({ ...loginParams, id: 'tc-build', name: 'Bundle output', checkKind: 'build' })

const passA = recordTestResult(loginCase, true, 1.5, null, null, 'all assertions held', 1000)
const passB = recordTestResult(saveCase, true, 1, null, null, 'all assertions held', 2000)
const passC = recordTestResult(combatCase, true, 1, null, null, 'all assertions held', 3000)
const failA = recordTestResult(perfCase, false, 0.5, 'fps dropped below target', 'shots/perf.png', 'trace', 4000)

describe('createGameTestCase', () => {
  it('copies every field from the params', () => {
    const tc = createGameTestCase(loginParams)
    expect(tc.id).toBe('tc-login')
    expect(tc.name).toBe('Login flow')
    expect(tc.type).toBe('e2e')
    expect(tc.description).toBe('User logs in with valid credentials')
    expect(tc.preconditions).toEqual(['account exists'])
    expect(tc.steps).toEqual(['open app', 'enter credentials', 'submit'])
    expect(tc.expectedResults).toEqual(['dashboard shown'])
    expect(tc.automated).toBe(true)
    expect(tc.platforms).toEqual(['windows', 'linux'])
    expect(tc.estimatedDurationSeconds).toBe(12.5)
    expect(tc.tags).toEqual(['smoke', 'auth'])
  })
  it('returns a distinct object', () => {
    const tc = createGameTestCase(loginParams)
    expect(Object.is(tc, loginParams)).toBe(false)
  })
  it('preserves empty lists', () => {
    const tc = createGameTestCase({
      ...loginParams,
      preconditions: [],
      steps: [],
      expectedResults: [],
      platforms: [],
      tags: [],
    })
    expect(tc.steps).toEqual([])
    expect(tc.preconditions).toEqual([])
  })
})

describe('recordTestResult', () => {
  it('records a passing run', () => {
    const r = recordTestResult(loginCase, true, 3.5, null, null, 'ok', 1000)
    expect(r.testId).toBe('tc-login')
    expect(r.passed).toBe(true)
    expect(r.durationSeconds).toBe(3.5)
    expect(r.errorMessage).toBeNull()
    expect(r.screenshotPath).toBeNull()
    expect(r.logOutput).toBe('ok')
    expect(r.timestamp).toBe(1000)
  })
  it('records a failing run with diagnostics', () => {
    const r = recordTestResult(perfCase, false, 0.5, 'fps dropped', 'shots/perf.png', 'trace', 4000)
    expect(r.testId).toBe('tc-perf')
    expect(r.passed).toBe(false)
    expect(r.durationSeconds).toBe(0.5)
    expect(r.errorMessage).toBe('fps dropped')
    expect(r.screenshotPath).toBe('shots/perf.png')
    expect(r.logOutput).toBe('trace')
    expect(r.timestamp).toBe(4000)
  })
})

describe('aggregateTestSuite', () => {
  it('aggregates counts, pass rate, and duration', () => {
    const suite = aggregateTestSuite('nightly', [passA, passB, passC, failA])
    expect(suite.suiteName).toBe('nightly')
    expect(suite.total).toBe(4)
    expect(suite.passed).toBe(3)
    expect(suite.failed).toBe(1)
    expect(suite.skipped).toBe(0)
    expect(suite.passRate).toBe(75)
    expect(suite.totalDurationSeconds).toBe(4)
  })
  it('returns a zero pass rate for an empty suite', () => {
    const suite = aggregateTestSuite('empty', [])
    expect(suite.total).toBe(0)
    expect(suite.passRate).toBe(0)
    expect(suite.skipped).toBe(0)
    expect(suite.totalDurationSeconds).toBe(0)
    expect(suite.results).toEqual([])
  })
  it('keeps skipped at zero because the model tracks only pass and fail', () => {
    const suite = aggregateTestSuite('nightly', [passA, passB, passC, failA])
    expect(suite.total).toBe(suite.passed + suite.failed)
    expect(suite.skipped).toBe(0)
  })
  it('retains the input results array', () => {
    const results = [passA, passB]
    const suite = aggregateTestSuite('subset', results)
    expect(suite.results).toBe(results)
  })
})

describe('checkSuiteQuality', () => {
  const good = aggregateTestSuite('clean', [passA, passB, passC])
  const mixed = aggregateTestSuite('nightly', [passA, passB, passC, failA])
  it('passes when thresholds are met', () => {
    const check = checkSuiteQuality(good, 90, 10)
    expect(check.passes).toBe(true)
    expect(check.issues).toEqual([])
  })
  it('accepts a pass rate exactly at the minimum', () => {
    const check = checkSuiteQuality(good, 100, 10)
    expect(check.passes).toBe(true)
  })
  it('reports a pass rate below the minimum', () => {
    const check = checkSuiteQuality(mixed, 80, 100)
    expect(check.passes).toBe(false)
    expect(check.issues).toEqual(['pass rate 75.0% is below minimum 80%', '1 test(s) failed'])
  })
  it('reports a duration above the maximum', () => {
    const check = checkSuiteQuality(good, 90, 2)
    expect(check.passes).toBe(false)
    expect(check.issues).toEqual(['total duration 3.5s exceeds maximum 2s'])
  })
  it('reports every failed test count', () => {
    const allFailed = aggregateTestSuite('worst', [failA, recordTestResult(saveCase, false, 1, 'boom', null, null, 5000)])
    const check = checkSuiteQuality(allFailed, 0, 1000)
    expect(check.passes).toBe(false)
    expect(check.issues).toEqual(['2 test(s) failed'])
  })
  it('lists all issues in check order', () => {
    const check = checkSuiteQuality(mixed, 80, 2)
    expect(check.issues).toEqual([
      'pass rate 75.0% is below minimum 80%',
      'total duration 4.0s exceeds maximum 2s',
      '1 test(s) failed',
    ])
  })
})

describe('filterResultsByStatus', () => {
  const results = [passA, failA, passB]
  it('returns passed results', () => {
    const passed = filterResultsByStatus(results, 'passed')
    expect(passed).toHaveLength(2)
    expect(passed.map((r) => r.testId)).toEqual(['tc-login', 'tc-save'])
  })
  it('returns failed results', () => {
    const failed = filterResultsByStatus(results, 'failed')
    expect(failed).toHaveLength(1)
    expect(failed.map((r) => r.testId)).toEqual(['tc-perf'])
  })
  it('returns nothing for skipped because the model does not track it', () => {
    expect(filterResultsByStatus(results, 'skipped')).toHaveLength(0)
    expect(filterResultsByStatus([], 'skipped')).toHaveLength(0)
  })
})

describe('getFailedTests', () => {
  it('returns failed ids with their error messages', () => {
    const noError = recordTestResult(saveCase, false, 0.2, null, null, null, 5000)
    const failed = getFailedTests([passA, failA, noError])
    expect(failed).toEqual([
      { testId: 'tc-perf', errorMessage: 'fps dropped below target' },
      { testId: 'tc-save', errorMessage: 'unknown error' },
    ])
  })
  it('returns nothing when every test passed', () => {
    expect(getFailedTests([passA, passB, passC])).toEqual([])
  })
  it('returns nothing for empty input', () => {
    expect(getFailedTests([])).toEqual([])
  })
})

describe('checkKind field default and derivation', () => {
  it('omits checkKind when the params declare none', () => {
    const tc = createGameTestCase(loginParams)
    expect('checkKind' in tc).toBe(false)
  })
  it('copies a declared checkKind', () => {
    const tc = createGameTestCase({ ...loginParams, checkKind: 'build' })
    expect(tc.checkKind).toBe('build')
  })
  it('resolves a declared checkKind as it stands', () => {
    expect(resolveCheckKind(visualCase)).toBe('visual')
    expect(resolveCheckKind(buildCase)).toBe('build')
  })
  it('derives static for a unit case with no declared kind', () => {
    expect('checkKind' in unitCase).toBe(false)
    expect(resolveCheckKind(unitCase)).toBe('static')
  })
  it('derives gameplay for every other type with no declared kind', () => {
    for (const type of ['integration', 'e2e', 'playthrough', 'performance', 'regression'] as const) {
      const tc = createGameTestCase({ ...loginParams, id: `tc-${type}`, type })
      expect(resolveCheckKind(tc)).toBe('gameplay')
    }
  })
  it('lets a declared checkKind override the derived kind', () => {
    const tc = createGameTestCase({ ...loginParams, id: 'tc-unit-override', type: 'unit', checkKind: 'gameplay' })
    expect(resolveCheckKind(tc)).toBe('gameplay')
  })
})

describe('check kind round-trip', () => {
  for (const kind of ['static', 'gameplay', 'build', 'visual'] as const) {
    it(`carries ${kind} from create through record into aggregation`, () => {
      const tc = createGameTestCase({ ...loginParams, id: `tc-${kind}`, name: `${kind} check`, checkKind: kind })
      expect(tc.checkKind).toBe(kind)
      expect(resolveCheckKind(tc)).toBe(kind)
      const r = recordTestResult(tc, true, 0.5, null, null, 'ok', 1000)
      expect(r.checkKind).toBe(kind)
      const suite = aggregateTestSuite(`${kind} suite`, [r])
      expect(suite.results).toHaveLength(1)
      expect(suite.results[0]?.checkKind).toBe(kind)
      expect(suite.unverifiedVisual).toBe(kind === 'visual' ? 1 : 0)
    })
  }

  it('records the derived kind for a case that declares none', () => {
    const r = recordTestResult(unitCase, true, 0.5, null, null, 'ok', 1000)
    expect(r.checkKind).toBe('static')
    const suite = aggregateTestSuite('derived', [r])
    expect(suite.results[0]?.checkKind).toBe('static')
    expect(suite.unverifiedVisual).toBe(0)
  })

  it('reports no unverified visual results for an empty suite', () => {
    expect(aggregateTestSuite('empty', []).unverifiedVisual).toBe(0)
  })
})

describe('visual results without evidence', () => {
  const visualWithoutEvidence = recordTestResult(visualCase, true, 1, null, null, 'screens matched', 1000)
  const visualWithEvidence = recordTestResult(visualCase, true, 1, null, 'shots/title.png', 'screens matched', 2000)

  it('classifies a passed visual result with no screenshot as unverified', () => {
    const suite = aggregateTestSuite('visual', [visualWithoutEvidence])
    expect(suite.unverifiedVisual).toBe(1)
  })
  it('counts every visual result that holds no screenshot', () => {
    const failed = recordTestResult(visualCase, false, 1, 'layout shifted', null, 'diff', 3000)
    const suite = aggregateTestSuite('visual', [visualWithoutEvidence, failed])
    expect(suite.unverifiedVisual).toBe(2)
  })
  it('leaves a visual result with a screenshot verified', () => {
    const suite = aggregateTestSuite('visual', [visualWithEvidence])
    expect(suite.unverifiedVisual).toBe(0)
  })
  it('leaves non-visual results without screenshots verified', () => {
    const suite = aggregateTestSuite('mixed', [passA, failA])
    expect(suite.unverifiedVisual).toBe(0)
  })
  it('fails the quality check instead of passing visual verification', () => {
    const suite = aggregateTestSuite('visual', [visualWithoutEvidence])
    const check = checkSuiteQuality(suite, 100, 1000)
    expect(check.passes).toBe(false)
    expect(check.issues).toEqual([
      '1 visual check(s) lack screenshot evidence and cannot claim visual verification',
    ])
  })
  it('passes the quality check when the screenshot is present', () => {
    const suite = aggregateTestSuite('visual', [visualWithEvidence])
    const check = checkSuiteQuality(suite, 100, 1000)
    expect(check.passes).toBe(true)
    expect(check.issues).toEqual([])
  })
  it('lists the evidence issue after the other issues', () => {
    const failing = recordTestResult(visualCase, false, 1, 'layout shifted', null, 'diff', 3000)
    const suite = aggregateTestSuite('visual', [visualWithoutEvidence, failing])
    const check = checkSuiteQuality(suite, 100, 1000)
    expect(check.issues).toEqual([
      'pass rate 50.0% is below minimum 100%',
      '1 test(s) failed',
      '2 visual check(s) lack screenshot evidence and cannot claim visual verification',
    ])
  })
})
