import { describe, expect, it } from 'vitest'
import {
  approvalExplanation,
  canTransitionTaskState,
  checkBudget,
  classifyClaimSupport,
  compareRisk,
  completionPercent,
  createCompletionReport,
  createProgress,
  createTaskRecord,
  createTestPlan,
  createUsage,
  createVerificationEntry,
  currentStep,
  decideApproval,
  digestLog,
  EVIDENCE_CATEGORY_RANK,
  formatBudgetStatus,
  formatLogDigest,
  formatProgress,
  hasErrors,
  hasVerificationFailure,
  isClaimSupported,
  isCompletionVerified,
  isHighRisk,
  isPlanComplete,
  isProgressComplete,
  isTerminalTaskState,
  isVerificationSuccessful,
  maxRisk,
  progressCounts,
  recordCriterion,
  recordUsage,
  requiresApproval,
  riskLabel,
  TERMINAL_TASK_STATES,
  transitionTaskState,
  unverifiedCriteria,
  updateStep,
  type AcceptanceCriterion,
  type ApprovalContext,
  type BudgetLimits,
  type Claim,
  type TaskRecord,
  type TaskState,
} from '../src/index.ts'

const TASK_ID = 'task-7f3a'
const BLOCKED_TASK_ID = 'task-9c21'
const FAILED_TASK_ID = 'task-44be'
const T0 = 1_700_000_000_000

const CRITERIA: readonly Omit<AcceptanceCriterion, 'state'>[] = [
  {
    id: 'trailing-comma',
    description: 'the parser accepts a trailing comma in call arguments',
    evidenceCommand: 'pnpm test parser',
  },
  {
    id: 'error-message',
    description: 'the parser reports the column on malformed input',
    evidenceCommand: 'pnpm test parser',
  },
]

function runningTaskFor(id: string): TaskRecord {
  const queued = createTaskRecord(id, T0)
  const planning = transitionTaskState(queued, 'planning', undefined, T0 + 1_000)
  return transitionTaskState(planning, 'running', undefined, T0 + 2_000)
}

function scenarioSteps() {
  return createProgress([
    { id: 'plan', label: 'Plan the parser change' },
    { id: 'implement', label: 'Implement the parser change' },
    { id: 'verify', label: 'Verify the parser change' },
  ])
}

function completedPlan() {
  return recordCriterion(
    recordCriterion(createTestPlan(TASK_ID, CRITERIA), 'trailing-comma', 'passed'),
    'error-message',
    'skipped',
  )
}

function completedProgress() {
  return updateStep(
    updateStep(updateStep(scenarioSteps(), 'plan', 'done'), 'implement', 'done'),
    'verify',
    'done',
  )
}

describe('verified completion walkthrough', () => {
  it('starts a queued record with pending progress and no terminal state', () => {
    const task = createTaskRecord(TASK_ID, T0)
    const progress = scenarioSteps()

    expect(task.id).toBe(TASK_ID)
    expect(task.state).toBe('queued')
    expect(task.createdAt).toBe(T0)
    expect(task.updatedAt).toBe(T0)
    expect(task.note).toBeUndefined()
    expect(isTerminalTaskState(task.state)).toBe(false)
    expect(canTransitionTaskState(task.state, 'planning')).toBe(true)
    expect(progressCounts(progress)).toEqual({ pending: 3, 'in-progress': 0, done: 0, failed: 0 })
    expect(isProgressComplete(progress)).toBe(false)
    expect(currentStep(progress)?.id).toBe('plan')
    expect(currentStep(progress)?.state).toBe('pending')
  })

  it('walks the record to running while the plan still reports everything unverified', () => {
    const queued = createTaskRecord(TASK_ID, T0)
    const planning = transitionTaskState(queued, 'planning', 'scope recorded', T0 + 1_000)

    expect(planning.state).toBe('planning')
    expect(planning.createdAt).toBe(T0)
    expect(planning.updatedAt).toBe(T0 + 1_000)
    expect(planning.note).toBe('scope recorded')
    expect(queued.state).toBe('queued')

    const running = transitionTaskState(planning, 'running', 'implementation started', T0 + 2_000)
    expect(running.state).toBe('running')
    expect(running.createdAt).toBe(T0)

    const plan = createTestPlan(running.id, CRITERIA)
    expect(plan.taskId).toBe(TASK_ID)
    expect(isPlanComplete(plan)).toBe(false)
    expect(unverifiedCriteria(plan)).toHaveLength(2)
    expect(completionPercent(plan)).toBe(0)
    expect(canTransitionTaskState(running.state, 'waiting-approval')).toBe(true)
  })

  it('auto-approves a medium-risk edit in a trusted workspace without touching the record', () => {
    const running = runningTaskFor(TASK_ID)
    const risk = maxRisk(['low', 'medium'])
    const ctx: ApprovalContext = { risk, trustedWorkspace: true, dryRun: false, userApproved: false }

    expect(risk).toBe('medium')
    expect(isHighRisk(risk)).toBe(false)
    expect(requiresApproval(risk)).toBe(false)
    expect(compareRisk(risk, 'high')).toBeLessThan(0)
    expect(riskLabel(risk)).toBe('Medium risk')
    expect(decideApproval(ctx)).toBe('auto')
    expect(approvalExplanation(ctx, 'auto')).toBe(
      'Auto-approved: medium risk is allowed in a trusted workspace.',
    )
    expect(running.state).toBe('running')
    expect(isTerminalTaskState(running.state)).toBe(false)
  })

  it('advances progress in step with the criteria recorded so far', () => {
    const plan = recordCriterion(createTestPlan(TASK_ID, CRITERIA), 'trailing-comma', 'passed')
    const progress = updateStep(updateStep(scenarioSteps(), 'plan', 'done'), 'implement', 'done')

    expect(completionPercent(plan)).toBe(50)
    expect(unverifiedCriteria(plan).map((criterion) => criterion.id)).toEqual(['error-message'])
    expect(progressCounts(progress)).toEqual({ pending: 1, 'in-progress': 0, done: 2, failed: 0 })
    expect(currentStep(progress)?.id).toBe('verify')
    expect(isProgressComplete(progress)).toBe(false)
    expect(isPlanComplete(plan)).toBe(false)
    expect(formatProgress(progress)).toBe(
      '[x] Plan the parser change\n[x] Implement the parser change\n[ ] Verify the parser change',
    )
  })

  it('turns a passing verification command into a fact-grade criterion', () => {
    const entry = createVerificationEntry({
      taskId: TASK_ID,
      intendedChange: 'accept a trailing comma in call arguments',
      actualChange: 'the argument scanner keeps a pending comma before the closing paren',
      verificationCommand: 'pnpm test parser',
      exitStatus: 0,
      outputLocation: 'logs/parser-verify.txt',
      timestamp: T0 + 5_000,
      outstandingIssues: [],
    })

    expect(isVerificationSuccessful(entry)).toBe(true)

    const claim: Claim = {
      text: 'the parser accepts a trailing comma in call arguments',
      evidence: [
        {
          id: 'ev-1',
          category: 'verified-command',
          subject: 'parser acceptance suite',
          source: 'pnpm test parser',
          timestamp: entry.timestamp,
        },
        { id: 'ev-2', category: 'inferred', subject: 'the fix generalizes to arrow-call arguments' },
      ],
    }
    expect(classifyClaimSupport(claim)).toBe('verified-command')
    expect(isClaimSupported(claim)).toBe(true)
    expect(EVIDENCE_CATEGORY_RANK['verified-command']).toBeLessThan(
      EVIDENCE_CATEGORY_RANK['supported-docs'],
    )

    const plan = recordCriterion(
      createTestPlan(TASK_ID, CRITERIA),
      'trailing-comma',
      isVerificationSuccessful(entry) ? 'passed' : 'failed',
    )
    expect(unverifiedCriteria(plan).map((criterion) => criterion.id)).toEqual(['error-message'])
  })

  it('finishes the plan and the progress list only after the last command passes', () => {
    const lastEntry = createVerificationEntry({
      taskId: TASK_ID,
      intendedChange: 'report the column on malformed input',
      actualChange: 'the scanner reports the opening paren column',
      verificationCommand: 'pnpm test parser',
      exitStatus: 0,
      timestamp: T0 + 5_500,
      outstandingIssues: [],
    })
    expect(isVerificationSuccessful(lastEntry)).toBe(true)

    const plan = completedPlan()
    expect(isPlanComplete(plan)).toBe(true)
    expect(completionPercent(plan)).toBe(50)
    expect(unverifiedCriteria(plan)).toHaveLength(0)

    const progress = completedProgress()
    expect(isProgressComplete(progress)).toBe(true)
    expect(currentStep(progress)).toBeUndefined()
    expect(progressCounts(progress)).toEqual({ pending: 0, 'in-progress': 0, done: 3, failed: 0 })
    expect(formatProgress(progress)).toBe(
      '[x] Plan the parser change\n[x] Implement the parser change\n[x] Verify the parser change',
    )
  })

  it('stops at completed after verifying and refuses every further transition', () => {
    const running = runningTaskFor(TASK_ID)
    const plan = completedPlan()
    const progress = completedProgress()

    expect(canTransitionTaskState('running', 'completed')).toBe(true)
    expect(
      canTransitionTaskState(running.state, 'verifying') && isPlanComplete(plan) && isProgressComplete(progress),
    ).toBe(true)

    const verifying = transitionTaskState(running, 'verifying', 'full suite green', T0 + 6_000)
    const completed = transitionTaskState(verifying, 'completed', 'criteria resolved', T0 + 7_000)

    expect(completed.state).toBe('completed')
    expect(completed.note).toBe('criteria resolved')
    expect(TERMINAL_TASK_STATES).toContain(completed.state)
    expect(isTerminalTaskState(completed.state)).toBe(true)
    expect(canTransitionTaskState(completed.state, 'running')).toBe(false)
    expect(() => transitionTaskState(completed, 'running')).toThrow(
      'invalid task transition: completed -> running',
    )
  })

  it('reports completion as verified only when every module agrees', () => {
    const completed = transitionTaskState(
      transitionTaskState(runningTaskFor(TASK_ID), 'verifying', 'suite green', T0 + 6_000),
      'completed',
      'criteria resolved',
      T0 + 7_000,
    )
    const report = createCompletionReport({
      taskId: TASK_ID,
      filesModified: ['src/parser.ts'],
      featuresImplemented: ['trailing comma support in call arguments'],
      testsExecuted: ['pnpm test parser'],
      commandsExecuted: ['pnpm test parser', 'pnpm build'],
      verificationOutcomes: [{ command: 'pnpm test parser', exitStatus: 0, summary: '12 passed' }],
      buildStatus: 'passed',
      knownLimitations: ['tuple type arguments stay unsupported'],
      remainingWork: [],
      timestamp: T0 + 7_000,
    })

    expect(report.taskId).toBe(completed.id)
    expect(report.filesModified).toContain('src/parser.ts')
    expect(report.verificationOutcomes).toHaveLength(1)
    expect(isCompletionVerified(report)).toBe(true)
    expect(hasVerificationFailure(report)).toBe(false)
    expect(
      isCompletionVerified(report) &&
        isPlanComplete(completedPlan()) &&
        isProgressComplete(completedProgress()) &&
        isTerminalTaskState(completed.state),
    ).toBe(true)

    const unfinished = createCompletionReport({
      taskId: TASK_ID,
      buildStatus: 'passed',
      verificationOutcomes: report.verificationOutcomes,
      remainingWork: ['tuple type arguments stay unsupported'],
      timestamp: report.timestamp,
    })
    expect(isCompletionVerified(unfinished)).toBe(false)
  })
})

describe('approval-gated work', () => {
  it('holds a critical-risk publish outside a trusted workspace for approval', () => {
    const risk = maxRisk(['medium', 'low', 'critical'])
    const ctx: ApprovalContext = { risk, trustedWorkspace: false, dryRun: false, userApproved: false }

    expect(risk).toBe('critical')
    expect(isHighRisk(risk)).toBe(true)
    expect(requiresApproval(risk)).toBe(true)
    expect(compareRisk(risk, 'high')).toBeGreaterThan(0)
    expect(riskLabel(risk)).toBe('Critical risk')
    expect(decideApproval(ctx)).toBe('require-approval')
    expect(approvalExplanation(ctx, 'require-approval')).toBe(
      'Approval required: critical risk requires approval outside a trusted workspace.',
    )

    const trusted: ApprovalContext = { ...ctx, trustedWorkspace: true }
    expect(decideApproval(trusted)).toBe('require-approval')
    expect(approvalExplanation(trusted, 'require-approval')).toBe(
      'Approval required: critical risk requires approval even in a trusted workspace.',
    )

    const preview: ApprovalContext = { ...ctx, dryRun: true }
    expect(decideApproval(preview)).toBe('auto')
    expect(approvalExplanation(preview, 'auto')).toBe(
      'Auto-approved: the invocation is a dry run and has no side effects.',
    )
  })

  it('parks the running task in waiting-approval instead of verifying', () => {
    const ctx: ApprovalContext = { risk: 'critical', trustedWorkspace: true, dryRun: false, userApproved: false }
    expect(decideApproval(ctx)).toBe('require-approval')

    const parked = transitionTaskState(
      runningTaskFor(BLOCKED_TASK_ID),
      'waiting-approval',
      'publish needs the user',
      T0 + 3_000,
    )

    expect(parked.state).toBe('waiting-approval')
    expect(parked.note).toBe('publish needs the user')
    expect(isTerminalTaskState(parked.state)).toBe(false)
    expect(canTransitionTaskState(parked.state, 'verifying')).toBe(false)
    expect(canTransitionTaskState(parked.state, 'completed')).toBe(false)
    expect(() => transitionTaskState(parked, 'verifying')).toThrow(/invalid task transition/)
    expect(canTransitionTaskState(parked.state, 'running')).toBe(true)
  })

  it('keeps assumed evidence and pending criteria out of the verified verdict', () => {
    const assumed: Claim = {
      text: 'the publish step preserves the release order',
      evidence: [{ id: 'ev-3', category: 'assumed', subject: 'release order' }],
    }
    const empty: Claim = { text: 'the cache is warm', evidence: [] }
    const refuted: Claim = {
      text: 'the build passes',
      evidence: [
        { id: 'ev-4', category: 'verified-command', subject: 'previous green run' },
        { id: 'ev-5', category: 'failed-verification', subject: 'current run' },
      ],
    }

    expect(classifyClaimSupport(assumed)).toBe('assumed')
    expect(isClaimSupported(assumed)).toBe(false)
    expect(classifyClaimSupport(empty)).toBe('unknown')
    expect(isClaimSupported(empty)).toBe(false)
    expect(classifyClaimSupport(refuted)).toBe('failed-verification')
    expect(isClaimSupported(refuted)).toBe(false)

    const plan = createTestPlan(BLOCKED_TASK_ID, CRITERIA)
    const report = createCompletionReport({
      taskId: BLOCKED_TASK_ID,
      buildStatus: 'not-run',
      knownLimitations: ['the publish command was never attempted'],
      remainingWork: ['publish after the user approves'],
      timestamp: T0 + 4_000,
    })

    expect(unverifiedCriteria(plan)).toHaveLength(2)
    expect(isPlanComplete(plan)).toBe(false)
    expect(isCompletionVerified(report)).toBe(false)
    expect(hasVerificationFailure(report)).toBe(false)
  })

  it('resumes the parked task after approval and reaches completion', () => {
    const ctx: ApprovalContext = { risk: 'critical', trustedWorkspace: false, dryRun: false, userApproved: true }
    expect(decideApproval(ctx)).toBe('auto')
    expect(approvalExplanation(ctx, 'auto')).toBe(
      'Auto-approved: the user already approved this invocation.',
    )

    const parked = transitionTaskState(
      runningTaskFor(BLOCKED_TASK_ID),
      'waiting-approval',
      'publish needs the user',
      T0 + 3_000,
    )
    const resumed = transitionTaskState(parked, 'running', 'the user approved the publish', T0 + 4_000)
    expect(resumed.state).toBe('running')
    expect(resumed.createdAt).toBe(T0)

    const completed = transitionTaskState(
      transitionTaskState(resumed, 'verifying', undefined, T0 + 5_000),
      'completed',
      undefined,
      T0 + 6_000,
    )
    expect(isTerminalTaskState(completed.state)).toBe(true)
    expect(completed.note).toBeUndefined()
  })
})

describe('failure and recovery', () => {
  it('digests a failing build log into counts and de-duplicated entries', () => {
    const buildLog = [
      '> tsc -b .',
      "src/parser.ts(12,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'Token'",
      "src/parser.ts(12,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'Token'",
      'warning: unused local variable tmp',
      '3 tests failed',
    ].join('\n')

    const digest = digestLog(buildLog)
    expect(digest.lines).toBe(5)
    expect(hasErrors(digest)).toBe(true)
    expect(digest.errorCount).toBe(3)
    expect(digest.warningCount).toBe(1)
    expect(digest.errors).toHaveLength(2)
    expect(digest.errors[0]?.line).toBe(2)
    expect(digest.errors[0]?.text).toContain('error TS2345')
    expect(digest.errors[1]?.line).toBe(5)
    expect(digest.warnings[0]?.line).toBe(4)
    expect(formatLogDigest(digest)).toBe(
      [
        '5 lines, 3 errors, 1 warnings',
        "error: line 2: src/parser.ts(12,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'Token'",
        'error: line 5: 3 tests failed',
        'warning: line 4: warning: unused local variable tmp',
      ].join('\n'),
    )

    const entry = createVerificationEntry({
      taskId: FAILED_TASK_ID,
      intendedChange: 'keep the parser change compiling',
      actualChange: 'the build fails on the argument type',
      verificationCommand: 'pnpm build',
      exitStatus: 1,
      outputLocation: 'logs/build.txt',
      timestamp: T0 + 5_000,
      outstandingIssues: digest.errors.map((error) => error.text),
    })
    expect(entry.outstandingIssues).toHaveLength(2)
    expect(isVerificationSuccessful(entry)).toBe(false)
  })

  it('records the failing criterion and the failed progress step from one run', () => {
    const plan = recordCriterion(
      recordCriterion(createTestPlan(FAILED_TASK_ID, CRITERIA), 'trailing-comma', 'failed'),
      'error-message',
      'skipped',
    )
    expect(isPlanComplete(plan)).toBe(false)
    expect(unverifiedCriteria(plan)).toHaveLength(1)
    expect(unverifiedCriteria(plan)[0]?.id).toBe('trailing-comma')
    expect(completionPercent(plan)).toBe(0)

    const progress = updateStep(
      updateStep(updateStep(scenarioSteps(), 'plan', 'done'), 'implement', 'done'),
      'verify',
      'failed',
    )
    expect(isProgressComplete(progress)).toBe(false)
    expect(currentStep(progress)).toBeUndefined()
    expect(progressCounts(progress)).toEqual({ pending: 0, 'in-progress': 0, done: 2, failed: 1 })
    expect(formatProgress(progress)).toContain('[!] Verify the parser change')
  })

  it('reports the failed run as unfinished and not verified', () => {
    const plan = recordCriterion(
      recordCriterion(createTestPlan(FAILED_TASK_ID, CRITERIA), 'trailing-comma', 'failed'),
      'error-message',
      'skipped',
    )
    const report = createCompletionReport({
      taskId: FAILED_TASK_ID,
      filesModified: ['src/parser.ts'],
      testsExecuted: ['pnpm test parser'],
      commandsExecuted: ['pnpm test parser', 'pnpm build'],
      verificationOutcomes: [
        { command: 'pnpm test parser', exitStatus: 1, summary: '1 failed, 11 passed' },
        { command: 'pnpm build', exitStatus: 1, summary: '3 errors' },
      ],
      buildStatus: 'failed',
      remainingWork: ['make the parser accept a trailing comma'],
      timestamp: T0 + 6_000,
    })

    expect(report.buildStatus).toBe('failed')
    expect(hasVerificationFailure(report)).toBe(true)
    expect(isCompletionVerified(report)).toBe(false)
    expect(unverifiedCriteria(plan)[0]?.description).toBe(
      'the parser accepts a trailing comma in call arguments',
    )
    expect(report.remainingWork).toContain('make the parser accept a trailing comma')
  })

  it('accepts a recoverable failure but never a direct return to verifying', () => {
    const entry = createVerificationEntry({
      taskId: FAILED_TASK_ID,
      intendedChange: 'accept a trailing comma in call arguments',
      actualChange: 'the acceptance suite still fails',
      verificationCommand: 'pnpm test parser',
      exitStatus: 1,
      timestamp: T0 + 6_000,
      outstandingIssues: ['trailing comma rejected'],
    })
    expect(isVerificationSuccessful(entry)).toBe(false)

    const running = runningTaskFor(FAILED_TASK_ID)
    const recoverable = transitionTaskState(
      running,
      'recoverable-failure',
      `verification command exited ${entry.exitStatus}`,
      T0 + 6_000,
    )
    expect(recoverable.state).toBe('recoverable-failure')
    expect(recoverable.note).toBe('verification command exited 1')
    expect(isTerminalTaskState(recoverable.state)).toBe(false)
    expect(canTransitionTaskState(recoverable.state, 'verifying')).toBe(false)
    expect(() => transitionTaskState(recoverable, 'verifying')).toThrow(
      'invalid task transition: recoverable-failure -> verifying',
    )

    const retried = transitionTaskState(recoverable, 'running', 'retry with a fixed scanner', T0 + 7_000)
    const failed = transitionTaskState(retried, 'failed', 'the retry exhausted the budget', T0 + 8_000)
    expect(failed.state).toBe('failed')
    expect(failed.createdAt).toBe(T0)
    expect(isTerminalTaskState(failed.state)).toBe(true)
    expect(canTransitionTaskState(failed.state, 'recoverable-failure')).toBe(false)
    expect(() => transitionTaskState(failed, 'running')).toThrow(/invalid task transition/)
  })

  it('allows no transition out of any terminal state', () => {
    const everyState: readonly TaskState[] = [
      'queued',
      'planning',
      'running',
      'waiting-approval',
      'verifying',
      'recoverable-failure',
      'completed',
      'cancelled',
      'failed',
    ]
    expect(TERMINAL_TASK_STATES).toHaveLength(3)

    for (const terminal of TERMINAL_TASK_STATES) {
      expect(isTerminalTaskState(terminal)).toBe(true)
      for (const next of everyState) {
        expect(canTransitionTaskState(terminal, next)).toBe(false)
      }
      const record: TaskRecord = { id: FAILED_TASK_ID, state: terminal, createdAt: T0, updatedAt: T0 }
      expect(() => transitionTaskState(record, 'running')).toThrow('invalid task transition: ')
    }
  })
})

describe('budget guard', () => {
  it('keeps a retry running while usage stays under every limit', () => {
    const limits: BudgetLimits = { maxTokens: 4_096, maxRequests: 8, maxCostUsd: 0.25 }
    const usage = createUsage()
    expect(usage).toEqual({ tokens: 0, requests: 0, costUsd: 0 })

    const start = checkBudget(limits, usage)
    expect(start.allowed).toBe(true)
    expect(start.exhausted).toEqual([])
    expect(formatBudgetStatus(start)).toBe(
      'within budget (tokens 0/4096, requests 0/8, cost $0.00/$0.25)',
    )

    const afterRetry = recordUsage(usage, { tokens: 4_000, requests: 7, costUsd: 0.1 })
    const mid = checkBudget(limits, afterRetry)
    expect(mid.allowed).toBe(true)
    expect(formatBudgetStatus(mid)).toBe(
      'within budget (tokens 4000/4096, requests 7/8, cost $0.10/$0.25)',
    )
    expect(usage.tokens).toBe(0)

    const recoverable = transitionTaskState(
      runningTaskFor(FAILED_TASK_ID),
      'recoverable-failure',
      'suite failed',
      T0 + 6_000,
    )
    const retried = transitionTaskState(recoverable, 'running', 'retry started', T0 + 7_000)
    const progress = updateStep(
      updateStep(updateStep(scenarioSteps(), 'plan', 'done'), 'implement', 'done'),
      'verify',
      'in-progress',
    )

    expect(retried.state).toBe('running')
    expect(currentStep(progress)?.id).toBe('verify')
    expect(checkBudget(limits, afterRetry).allowed).toBe(true)
    expect(isProgressComplete(progress)).toBe(false)
  })

  it('exhausts limits in tokens, requests, cost order exactly at the boundary', () => {
    const limits: BudgetLimits = { maxTokens: 4_096, maxRequests: 8, maxCostUsd: 0.25 }
    const spent = recordUsage(createUsage(), { tokens: 4_000, requests: 7, costUsd: 0.1 })

    const atRequestLimit = checkBudget(limits, recordUsage(spent, { requests: 1 }))
    expect(atRequestLimit.allowed).toBe(false)
    expect(atRequestLimit.exhausted).toEqual(['requests'])
    expect(formatBudgetStatus(atRequestLimit)).toBe(
      'exhausted: requests (tokens 4000/4096, requests 8/8, cost $0.10/$0.25)',
    )

    const overBudget = checkBudget(limits, recordUsage(spent, { tokens: 96, requests: 1, costUsd: 0.15 }))
    expect(overBudget.allowed).toBe(false)
    expect(overBudget.exhausted).toEqual(['tokens', 'requests', 'cost'])
    expect(formatBudgetStatus(overBudget)).toBe(
      'exhausted: tokens, requests, cost (tokens 4096/4096, requests 8/8, cost $0.25/$0.25)',
    )

    const running = runningTaskFor(FAILED_TASK_ID)
    expect(running.state).toBe('running')
    const parked = transitionTaskState(
      running,
      'recoverable-failure',
      `budget exhausted: ${overBudget.exhausted.join(', ')}`,
      T0 + 7_000,
    )
    expect(parked.note).toBe('budget exhausted: tokens, requests, cost')
    expect(canTransitionTaskState(parked.state, 'verifying')).toBe(false)
  })

  it('leaves unconstrained limits out of the decision and the status line', () => {
    const usage = recordUsage(createUsage(), { tokens: 9_000, requests: 40, costUsd: 3.5 })

    const unconstrained = checkBudget({}, usage)
    expect(unconstrained.allowed).toBe(true)
    expect(unconstrained.exhausted).toEqual([])
    expect(formatBudgetStatus(unconstrained)).toBe(
      'within budget (tokens 9000/-, requests 40/-, cost $3.50/-)',
    )

    const tokensOnly = checkBudget({ maxTokens: 10_000 }, usage)
    expect(tokensOnly.allowed).toBe(true)
    expect(formatBudgetStatus(tokensOnly)).toBe(
      'within budget (tokens 9000/10000, requests 40/-, cost $3.50/-)',
    )

    const progress = updateStep(scenarioSteps(), 'plan', 'done')
    expect(currentStep(progress)?.id).toBe('implement')
    expect(isProgressComplete(progress)).toBe(false)
  })

  it('refuses a negative delta and leaves usage and task state untouched', () => {
    const limits: BudgetLimits = { maxTokens: 4_096 }
    const usage = createUsage()
    const running = runningTaskFor(FAILED_TASK_ID)

    expect(() => recordUsage(usage, { tokens: -1 })).toThrow(
      'budget delta tokens must be non-negative: -1',
    )
    expect(() => recordUsage(usage, { requests: -2 })).toThrow(
      /budget delta requests must be non-negative/,
    )
    expect(() => recordUsage(usage, { costUsd: -0.01 })).toThrow(
      'budget delta costUsd must be non-negative: -0.01',
    )
    expect(usage).toEqual({ tokens: 0, requests: 0, costUsd: 0 })

    const spent = recordUsage(usage, { tokens: 100 })
    expect(() => recordUsage(spent, { tokens: -100 })).toThrow(
      'budget delta tokens must be non-negative: -100',
    )
    expect(spent.tokens).toBe(100)
    expect(checkBudget(limits, spent).allowed).toBe(true)
    expect(running.state).toBe('running')
    expect(isTerminalTaskState(running.state)).toBe(false)
  })
})
