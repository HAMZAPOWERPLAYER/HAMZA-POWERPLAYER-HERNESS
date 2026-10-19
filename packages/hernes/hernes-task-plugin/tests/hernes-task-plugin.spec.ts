import { describe, expect, it } from 'vitest'
import { HernesTaskService } from '../src/index.ts'

describe('HernesTaskService', () => {
  it('creates a task record', () => {
    const svc = new HernesTaskService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableTaskTracking: true, enableCompletionReport: true, enforceVerification: true },
    )
    const record = svc.createTask('task-1')
    expect(record.id).toBe('task-1')
    expect(record.state).toBe('queued')
  })

  it('transitions a task state', () => {
    const svc = new HernesTaskService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableTaskTracking: true, enableCompletionReport: true, enforceVerification: true },
    )
    const record = svc.createTask('task-1')
    const updated = svc.transitionTask(record, 'planning', 'started planning')
    expect(updated.state).toBe('planning')
    expect(updated.note).toBe('started planning')
  })

  it('creates a completion report', () => {
    const svc = new HernesTaskService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableTaskTracking: true, enableCompletionReport: true, enforceVerification: true },
    )
    const report = svc.createReport({
      taskId: 'task-1',
      filesModified: ['src/a.ts'],
      featuresImplemented: ['feature-a'],
      testsExecuted: ['test-a'],
      commandsExecuted: ['tsc'],
      verificationOutcomes: [{ command: 'tsc', exitStatus: 0 }],
      buildStatus: 'passed',
      knownLimitations: [],
      remainingWork: [],
    })
    expect(report.taskId).toBe('task-1')
    expect(report.buildStatus).toBe('passed')
    expect(svc.isReportVerified(report)).toBe(true)
  })

  it('reports unverified when remaining work exists', () => {
    const svc = new HernesTaskService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableTaskTracking: true, enableCompletionReport: true, enforceVerification: true },
    )
    const report = svc.createReport({
      taskId: 'task-2',
      filesModified: [],
      featuresImplemented: [],
      testsExecuted: [],
      commandsExecuted: [],
      verificationOutcomes: [],
      buildStatus: 'not-run',
      knownLimitations: [],
      remainingWork: ['finish feature'],
    })
    expect(svc.isReportVerified(report)).toBe(false)
  })
})
