/**
 * Review of a recorded change set before integration.
 *
 * `reviewIntegration` reads one coordination state, one change set, one
 * recorded test run, and any recorded disagreements, and reports a finding for
 * every record that does not support integration: a changed file without a
 * recorded owner, a changed file owned by an id the state does not list, a
 * changed file owned by more than one agent (read from
 * `checkFileOwnershipConflicts` in `game-multi-agent`, not recomputed here), a
 * test run that failed or never ran, and a disagreement recorded but never
 * settled.
 *
 * The review reads recorded state only; it is not a substitute for actually
 * running tests. A `passed` status reports what the caller recorded, and this
 * module executes nothing. Every function is pure: it reads only its
 * arguments, performs no I/O, and keeps no state, so the same input always
 * yields the same result.
 *
 * Severity separates a missing record (`warning`) from a recorded value that
 * contradicts integration (`error`). Every finding blocks approval, so
 * severity never changes `approved`, which is `true` exactly when `findings`
 * is empty.
 *
 * Findings keep one stable order: changed files in change-set order, where a
 * repeated path is reviewed once at its first occurrence and each file
 * contributes its unowned, out-of-scope owner, and ownership-conflict
 * findings in that order; then at most one test-run finding; then one finding
 * per recorded disagreement in input order. An empty change set records no
 * ownership findings, and an empty or omitted disagreement list records no
 * disagreement finding; neither skips the test-run check.
 *
 * @module @deepseek-ai/dsh-util-values/game-integration-review
 */

import { type AgentCoordinationState, checkFileOwnershipConflicts } from './game-multi-agent.ts'

/** Recorded outcome of the integration test run. */
export type TestRunStatus = 'passed' | 'failed' | 'not-run'

/** Severity of one integration-review finding. */
export type IntegrationSeverity = 'warning' | 'error'

/** Stable identifiers of the checks that record integration-review findings. */
export type IntegrationFindingId =
  | 'changed-file-unowned'
  | 'changed-file-owner-out-of-scope'
  | 'changed-file-ownership-conflict'
  | 'tests-failed'
  | 'tests-not-run'
  | 'unresolved-disagreement'

/** The files changed by the change set under review. */
export interface IntegrationChangeSet {
  /** Changed file paths in the order the caller recorded them; a repeated path is reviewed once. */
  readonly files: readonly string[]
}

/** The recorded outcome of running the integration tests. */
export interface IntegrationTestRun {
  /** Recorded status of the run. */
  readonly status: TestRunStatus
  /** Recorded failing test descriptions; omitted when the run recorded no failure. */
  readonly failures?: readonly string[]
}

/** One disagreement between agents that was recorded and never settled. */
export interface RecordedDisagreement {
  /** Subject the agents disagreed on. */
  readonly topic: string
  /** Ids of the agents that hold the recorded positions. */
  readonly agents: readonly string[]
}

/** One problem recorded by an integration review. */
export interface IntegrationFinding {
  /** Stable identifier of the check that recorded the finding. */
  readonly id: IntegrationFindingId
  /** Severity of the finding; every severity blocks approval. */
  readonly severity: IntegrationSeverity
  /** Human-readable description of the recorded problem. */
  readonly message: string
  /** Changed file path the finding concerns, or `null` when the finding concerns no single file. */
  readonly filePath: string | null
}

/** Outcome of an integration review. */
export interface IntegrationReviewResult {
  /** Findings in the documented stable order; empty when every check passed. */
  readonly findings: readonly IntegrationFinding[]
  /** Whether the change set may be integrated; `true` exactly when `findings` is empty. */
  readonly approved: boolean
  /** One-line outcome: `integration approved`, or `integration not approved: N findings` with the recorded count. */
  readonly summary: string
}

/**
 * Review one recorded change set before it is integrated.
 *
 * The review scope is the agents listed in `state.agents`: a changed file
 * owned by any other id is reported as out of scope, because the state lists
 * no agent that holds that ownership record. Ownership conflicts are read from
 * `checkFileOwnershipConflicts` and reported only for files in the change
 * set, because files the change set does not touch are outside this review.
 *
 * A recorded failure marks the run failed for this review whatever `status`
 * says, so recorded failures never approve. An empty change set records no
 * ownership finding, and an empty or omitted `disagreements` records no
 * disagreement finding; neither skips the test-run check. This reviews
 * recorded state only; it does not run tests.
 *
 * @param state - coordination state holding the agents and file ownership records.
 * @param changeSet - files the change set changed.
 * @param testRun - recorded status and failures of the integration test run.
 * @param disagreements - disagreements recorded between agents and never settled; omitted records none.
 * @returns the findings in stable order, whether the change set is approved, and a one-line summary; approval holds exactly when no finding was recorded.
 */
export function reviewIntegration(
  state: AgentCoordinationState,
  changeSet: IntegrationChangeSet,
  testRun: IntegrationTestRun,
  disagreements?: readonly RecordedDisagreement[],
): IntegrationReviewResult {
  const findings: IntegrationFinding[] = [
    ...collectOwnershipFindings(state, changeSet.files),
    ...collectTestRunFindings(testRun),
    ...collectDisagreementFindings(disagreements ?? []),
  ]
  const approved = findings.length === 0
  const summary = approved
    ? 'integration approved'
    : `integration not approved: ${findings.length} finding${findings.length === 1 ? '' : 's'}`
  return { findings, approved, summary }
}

/**
 * Record the ownership findings for the changed files of one change set.
 *
 * @param state - coordination state holding the agents and file ownership records.
 * @param files - changed file paths in change-set order; a repeated path is reviewed once.
 * @returns one finding per applicable ownership check, in change-set order.
 */
function collectOwnershipFindings(
  state: AgentCoordinationState,
  files: readonly string[],
): IntegrationFinding[] {
  const agentIds = new Set(state.agents.map((agent) => agent.agentId))
  const conflictAgentIds = new Map<string, readonly string[]>()
  for (const conflict of checkFileOwnershipConflicts(state)) {
    conflictAgentIds.set(conflict.filePath, conflict.agentIds)
  }

  const findings: IntegrationFinding[] = []
  const reviewed = new Set<string>()
  for (const filePath of files) {
    if (reviewed.has(filePath)) continue
    reviewed.add(filePath)

    const owners = state.fileOwnership
      .filter((entry) => entry.filePath === filePath)
      .map((entry) => entry.agentId)
    if (owners.length === 0) {
      findings.push({
        id: 'changed-file-unowned',
        severity: 'warning',
        message: `changed file '${filePath}' has no recorded owner`,
        filePath,
      })
      continue
    }

    const unknownOwners = owners.filter((agentId) => !agentIds.has(agentId))
    if (unknownOwners.length > 0) {
      findings.push({
        id: 'changed-file-owner-out-of-scope',
        severity: 'error',
        message: `changed file '${filePath}' has an owner not recorded in the coordination state: ${unknownOwners.join(', ')}`,
        filePath,
      })
    }

    const conflictAgents = conflictAgentIds.get(filePath)
    if (conflictAgents !== undefined) {
      findings.push({
        id: 'changed-file-ownership-conflict',
        severity: 'error',
        message: `changed file '${filePath}' is owned by more than one agent: ${conflictAgents.join(', ')}`,
        filePath,
      })
    }
  }
  return findings
}

/**
 * Record the finding for one recorded test run.
 *
 * @param testRun - recorded status and failures of the integration test run.
 * @returns one finding when the run failed or never ran, otherwise no finding.
 */
function collectTestRunFindings(testRun: IntegrationTestRun): IntegrationFinding[] {
  const failures = testRun.failures ?? []
  if (testRun.status === 'failed' || failures.length > 0) {
    const detail = failures.length > 0 ? `: ${failures.join(', ')}` : ''
    return [{
      id: 'tests-failed',
      severity: 'error',
      message: `recorded test run failed${detail}`,
      filePath: null,
    }]
  }
  if (testRun.status === 'not-run') {
    return [{
      id: 'tests-not-run',
      severity: 'warning',
      message: 'recorded test run has not been run',
      filePath: null,
    }]
  }
  return []
}

/**
 * Record one finding per recorded disagreement.
 *
 * @param disagreements - disagreements recorded between agents and never settled.
 * @returns one finding per recorded disagreement, in input order, or no finding for an empty list.
 */
function collectDisagreementFindings(
  disagreements: readonly RecordedDisagreement[],
): IntegrationFinding[] {
  const findings: IntegrationFinding[] = []
  for (const disagreement of disagreements) {
    findings.push({
      id: 'unresolved-disagreement',
      severity: 'error',
      message: `unresolved disagreement recorded for '${disagreement.topic}' between agents: ${disagreement.agents.join(', ')}`,
      filePath: null,
    })
  }
  return findings
}
