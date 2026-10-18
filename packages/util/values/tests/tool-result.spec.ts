import { describe, expect, it } from 'vitest'
import {
  classifyToolResult,
  createToolResult,
  isToolResultFailed,
  isToolResultMocked,
  isToolResultNotRun,
  isToolResultSuccessful,
  toolResultSummary,
  type ToolResultEnvelope,
} from '../src/tool-result.ts'

describe('createToolResult', () => {
  it('builds an envelope with safe defaults (nothing attempted)', () => {
    const result = createToolResult({ invocationId: 'inv-1', action: 'tsc' })
    expect(result.invocationId).toBe('inv-1')
    expect(result.action).toBe('tsc')
    expect(result.attempted).toBe(false)
    expect(result.started).toBe(false)
    expect(result.completed).toBe(false)
    expect(result.exitStatus).toBeUndefined()
    expect(result.errors).toEqual([])
    expect(result.mocked).toBe(false)
    expect(result.retryCount).toBe(0)
  })

  it('honours caller-supplied fields', () => {
    const result = createToolResult({
      invocationId: 'inv-2',
      action: 'npm test',
      attempted: true,
      started: true,
      completed: true,
      exitStatus: 0,
      errors: [],
      workingDirectory: '/ws',
      mocked: false,
      retryCount: 1,
      output: 'ok',
      interpretation: 'tests passed',
    })
    expect(result.started).toBe(true)
    expect(result.completed).toBe(true)
    expect(result.exitStatus).toBe(0)
    expect(result.workingDirectory).toBe('/ws')
    expect(result.retryCount).toBe(1)
    expect(result.output).toBe('ok')
    expect(result.interpretation).toBe('tests passed')
  })

  it('does not treat an absent output as an empty string', () => {
    const result = createToolResult({ invocationId: 'inv-3', action: 'x' })
    expect(result.output).toBeUndefined()
  })
})

describe('isToolResultSuccessful', () => {
  it('reports true for a real successful execution', () => {
    const result: ToolResultEnvelope = createToolResult({
      invocationId: 'a',
      action: 'tsc',
      attempted: true,
      started: true,
      completed: true,
      exitStatus: 0,
      errors: [],
      mocked: false,
    })
    expect(isToolResultSuccessful(result)).toBe(true)
  })

  it('reports false when not attempted', () => {
    expect(isToolResultSuccessful(createToolResult({ invocationId: 'a', action: 'x' }))).toBe(false)
  })

  it('reports false when started but not completed', () => {
    const result = createToolResult({ invocationId: 'a', action: 'x', attempted: true, started: true, mocked: false })
    expect(isToolResultSuccessful(result)).toBe(false)
  })

  it('reports false for non-zero exit', () => {
    const result = createToolResult({
      invocationId: 'a',
      action: 'x',
      attempted: true,
      started: true,
      completed: true,
      exitStatus: 1,
      errors: [],
      mocked: false,
    })
    expect(isToolResultSuccessful(result)).toBe(false)
  })

  it('reports false when mocked', () => {
    const result = createToolResult({
      invocationId: 'a',
      action: 'x',
      attempted: true,
      started: true,
      completed: true,
      exitStatus: 0,
      errors: [],
      mocked: true,
    })
    expect(isToolResultSuccessful(result)).toBe(false)
  })

  it('reports false when errors recorded', () => {
    const result = createToolResult({
      invocationId: 'a',
      action: 'x',
      attempted: true,
      started: true,
      completed: true,
      exitStatus: 0,
      errors: ['ENOENT'],
      mocked: false,
    })
    expect(isToolResultSuccessful(result)).toBe(false)
  })
})

describe('isToolResultFailed', () => {
  it('reports false for a successful run', () => {
    const result = createToolResult({
      invocationId: 'a', action: 'x', attempted: true, started: true, completed: true, exitStatus: 0, errors: [], mocked: false,
    })
    expect(isToolResultFailed(result)).toBe(false)
  })

  it('reports true for non-zero exit', () => {
    const result = createToolResult({
      invocationId: 'a', action: 'x', attempted: true, started: true, completed: true, exitStatus: 1, errors: [], mocked: false,
    })
    expect(isToolResultFailed(result)).toBe(true)
  })

  it('reports true when timed out', () => {
    const result = createToolResult({
      invocationId: 'a', action: 'x', attempted: true, started: true, completed: false, timedOut: true, errors: [], mocked: false,
    })
    expect(isToolResultFailed(result)).toBe(true)
  })

  it('reports true when cancelled', () => {
    const result = createToolResult({
      invocationId: 'a', action: 'x', attempted: true, started: true, completed: false, cancelled: true, errors: [], mocked: false,
    })
    expect(isToolResultFailed(result)).toBe(true)
  })

  it('reports false when never attempted', () => {
    expect(isToolResultFailed(createToolResult({ invocationId: 'a', action: 'x' }))).toBe(false)
  })

  it('reports false when mocked', () => {
    const result = createToolResult({ invocationId: 'a', action: 'x', attempted: true, started: true, completed: true, exitStatus: 1, errors: [], mocked: true })
    expect(isToolResultFailed(result)).toBe(false)
  })
})

describe('isToolResultNotRun', () => {
  it('reports true when nothing was attempted', () => {
    expect(isToolResultNotRun(createToolResult({ invocationId: 'a', action: 'x' }))).toBe(true)
  })

  it('reports false once attempted', () => {
    expect(isToolResultNotRun(createToolResult({ invocationId: 'a', action: 'x', attempted: true }))).toBe(false)
  })
})

describe('isToolResultMocked', () => {
  it('reports true only for mocked results', () => {
    expect(isToolResultMocked(createToolResult({ invocationId: 'a', action: 'x', mocked: true }))).toBe(true)
    expect(isToolResultMocked(createToolResult({ invocationId: 'a', action: 'x' }))).toBe(false)
  })
})

describe('classifyToolResult', () => {
  it.each([
    [{ mocked: true }, 'mocked'],
    [{}, 'not-run'],
    [{ attempted: true, started: true, completed: true, exitStatus: 0, mocked: false }, 'successful'],
    [{ attempted: true, started: true, completed: true, exitStatus: 1, mocked: false }, 'failed'],
  ])('classifies %o as %s', (overrides, expected) => {
    const result = createToolResult({ invocationId: 'a', action: 'x', ...overrides })
    expect(classifyToolResult(result)).toBe(expected)
  })
})

describe('toolResultSummary', () => {
  it('describes a successful run', () => {
    const result = createToolResult({
      invocationId: 'inv-1', action: 'tsc', attempted: true, started: true, completed: true, exitStatus: 0, mocked: false,
    })
    expect(toolResultSummary(result)).toContain('tsc (inv-1)')
    expect(toolResultSummary(result)).toContain('exit 0')
  })

  it('describes a mocked run', () => {
    const result = createToolResult({ invocationId: 'inv-1', action: 'x', mocked: true })
    expect(toolResultSummary(result)).toContain('mocked')
  })

  it('describes retries, truncation, and errors', () => {
    const result = createToolResult({
      invocationId: 'inv-1', action: 'x', attempted: true, started: true, completed: true, exitStatus: 0,
      errors: ['fail'], truncated: true, retryCount: 2, mocked: false,
    })
    const summary = toolResultSummary(result)
    expect(summary).toContain('2 retry(ies)')
    expect(summary).toContain('1 error(s)')
    expect(summary).toContain('output truncated')
  })
})
