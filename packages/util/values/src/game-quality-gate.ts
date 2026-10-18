/**
 * Six-category pre-integration quality gate.
 *
 * Part 3 §20 of the design guide defines a pre-integration checklist whose six
 * categories — architecture, correctness, security, testing, performance, and
 * maintainability — each carry four questions, closed by the rule that the
 * checklist must not substitute for actual tests. This module evaluates that
 * checklist: callers run the specialized analyses in their own modules
 * (security audit, coverage gate, claim verification) and pass the resulting
 * findings in as check statuses. The evaluator owns only the verdict rules; it
 * runs no analysis, performs no I/O, and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-quality-gate
 */

import type { SecurityCheckResult } from './security-audit.ts'
import type { CoverageGateResult } from './test-coverage-gate.ts'
import { type Claim, classifyClaimSupport, isClaimSupported } from './verification.ts'

/** One of the six pre-integration checklist categories. */
export type QualityCategory =
  | 'architecture'
  | 'correctness'
  | 'security'
  | 'testing'
  | 'performance'
  | 'maintainability'

/**
 * Canonical category order. Results and findings are produced in this order,
 * so output ordering never depends on input ordering.
 */
export const QUALITY_CATEGORIES: readonly QualityCategory[] = [
  'architecture',
  'correctness',
  'security',
  'testing',
  'performance',
  'maintainability',
]

/**
 * Outcome recorded for one check. `not-applicable` records a documented reason
 * the question does not apply; `not-run` records that nobody answered it.
 */
export type QualityCheckStatus = 'pass' | 'fail' | 'not-applicable' | 'not-run'

/**
 * Verdict of one category or of the whole gate: `fail` when a check failed,
 * `blocked` when a check was never run, `pass` otherwise.
 */
export type QualityGateStatus = 'pass' | 'fail' | 'blocked'

/** One checklist question with its recorded outcome. */
export interface QualityCheck {
  /** Stable identifier for the check, unique within its category. */
  readonly id: string
  /** The checklist question this check answers. */
  readonly question: string
  /** Recorded outcome; a value outside the four statuses counts as `fail`. */
  readonly status: QualityCheckStatus
  /** Optional supporting detail: an audit failure reason, a coverage-gate summary, or the strongest evidence category. */
  readonly evidence?: string
}

/** Evaluator input for one category: the outcomes the caller recorded. */
export interface QualityCategoryInput {
  /** Category these checks belong to; each category may appear at most once. */
  readonly category: QualityCategory
  /** Recorded checks in the caller's order; an empty list is synthesized as not run. */
  readonly checks: readonly QualityCheck[]
}

/** The verdict for one category. */
export interface QualityCategoryResult {
  /** Category this result covers. */
  readonly category: QualityCategory
  /** Checks the verdict was derived from, in input order; synthesized when the caller supplied none. */
  readonly checks: readonly QualityCheck[]
  /** Category verdict: `fail` when a check failed, `blocked` when a check was not run, otherwise `pass`. */
  readonly status: QualityGateStatus
}

/** A check that failed or blocks the gate, identified for reporting. */
export interface QualityGateFinding {
  /** Category the check belongs to. */
  readonly category: QualityCategory
  /** Identifier of the offending check. */
  readonly checkId: string
  /** The checklist question the check answers. */
  readonly question: string
  /** Optional evidence recorded on the check. */
  readonly evidence?: string
}

/** The gate's verdict over all six categories. */
export interface QualityGateResult {
  /** Overall verdict: `fail` when any check failed, `blocked` when any check was not run, otherwise `pass`. */
  readonly overallStatus: QualityGateStatus
  /** One result per category — always all six — in {@link QUALITY_CATEGORIES} order. */
  readonly results: readonly QualityCategoryResult[]
  /** Checks counted as failures, in result order. */
  readonly failures: readonly QualityGateFinding[]
  /** Checks counted as not run, in result order. */
  readonly notRun: readonly QualityGateFinding[]
  /** Always `false`: passing this gate never replaces running tests. */
  readonly substituteForTests: false
}

/**
 * The canonical §20 checklist in evaluator-input form: six categories with
 * four questions each. Every check starts as `not-run`, so evaluating the
 * list unchanged yields `blocked` rather than `pass`; callers replace the
 * statuses with outcomes from the specialized analysis modules.
 */
export const QUALITY_GATE_CHECKLIST: readonly QualityCategoryInput[] = [
  {
    category: 'architecture',
    checks: [
      { id: 'architecture/ownership', question: 'Does each change stay within its owning package?', status: 'not-run' },
      { id: 'architecture/extension-point', question: 'Is new behavior added through a documented extension point rather than a core loop edit?', status: 'not-run' },
      { id: 'architecture/explicit-interfaces', question: 'Are cross-package interfaces explicit, with no hidden defaults?', status: 'not-run' },
      { id: 'architecture/registration-lifecycle', question: 'Is every registration released by its disposer on teardown?', status: 'not-run' },
    ],
  },
  {
    category: 'correctness',
    checks: [
      { id: 'correctness/edge-cases', question: 'Are empty, boundary, and malformed inputs handled?', status: 'not-run' },
      { id: 'correctness/error-paths', question: 'Do failure paths report typed, actionable errors instead of skipping silently?', status: 'not-run' },
      { id: 'correctness/authoritative-state', question: 'Is derived state read from a single authoritative source?', status: 'not-run' },
      { id: 'correctness/invariants', question: 'Do the changed paths preserve their documented invariants?', status: 'not-run' },
    ],
  },
  {
    category: 'security',
    checks: [
      { id: 'security/untrusted-input', question: 'Are untrusted inputs validated at parsing, durable-file, and wire boundaries?', status: 'not-run' },
      { id: 'security/secret-handling', question: 'Does the change keep secrets out of logs, output, and error messages?', status: 'not-run' },
      { id: 'security/privilege-bounds', question: 'Are sandbox, permission, and privilege bounds enforced where the operation executes?', status: 'not-run' },
      { id: 'security/dependency-review', question: 'Are external dependencies pinned and reviewed for known vulnerabilities?', status: 'not-run' },
    ],
  },
  {
    category: 'testing',
    checks: [
      { id: 'testing/unit-paths', question: 'Do the changed paths have unit tests covering pass and failure outcomes?', status: 'not-run' },
      { id: 'testing/snapshot-output', question: 'Does model- or user-visible output change come with an updated keyless snapshot?', status: 'not-run' },
      { id: 'testing/behavior-focus', question: 'Do tests assert observable behavior rather than implementation details?', status: 'not-run' },
      { id: 'testing/determinism', question: 'Do the tests pass repeatedly under parallel execution?', status: 'not-run' },
    ],
  },
  {
    category: 'performance',
    checks: [
      { id: 'performance/hot-paths', question: 'Are hot paths free of repeated or quadratic work per item?', status: 'not-run' },
      { id: 'performance/result-bounds', question: 'Are byte, token, item, and time limits applied to complete results?', status: 'not-run' },
      { id: 'performance/memory-growth', question: 'Does memory use stay bounded across long-running sessions?', status: 'not-run' },
      { id: 'performance/cache-lifetime', question: 'Are caches owned, invalidated, and released with their owner?', status: 'not-run' },
    ],
  },
  {
    category: 'maintainability',
    checks: [
      { id: 'maintainability/export-docs', question: 'Do changed exports and contracts carry current JSDoc?', status: 'not-run' },
      { id: 'maintainability/configuration', question: 'Are deployment-varying choices configuration fields rather than hardcoded tunables?', status: 'not-run' },
      { id: 'maintainability/duplication', question: 'Is new logic shared with existing implementations instead of duplicating them?', status: 'not-run' },
      { id: 'maintainability/comment-currency', question: 'Do comments and documentation describe current behavior?', status: 'not-run' },
    ],
  },
]

/**
 * Whether a passing gate may stand in for running tests: always `false`.
 * Part 3 §20 closes the checklist with the rule that it must not substitute
 * for actual tests, and every verdict carries the rule through
 * {@link QualityGateResult.substituteForTests}.
 */
export const QUALITY_GATE_SUBSTITUTE_FOR_TESTS = false

/**
 * Convert security audit results into `security` category checks. Each result
 * becomes one check whose status mirrors `passed` and whose `reason`, when
 * present, becomes the check's evidence, so the audit's verdict is consumed
 * rather than re-derived. An empty result list yields no checks, which the
 * gate then synthesizes as `not-run`.
 *
 * @param results - results from the security audit helpers.
 * @returns one quality check per audit result, in the supplied order.
 */
export function securityAuditChecks(results: readonly SecurityCheckResult[]): readonly QualityCheck[] {
  return results.map((result): QualityCheck => ({
    id: `security-audit/${result.check}`,
    question: `Did the security audit check ${result.check} pass?`,
    status: result.passed ? 'pass' : 'fail',
    ...(result.reason !== undefined ? { evidence: result.reason } : {}),
  }))
}

/**
 * Convert a coverage gate result into a `testing` category check. The gate's
 * `passed` verdict becomes the check status and its `summary` becomes
 * evidence, so the reason a gate failed travels with the finding.
 *
 * @param result - result returned by the coverage gate evaluation.
 * @returns a single quality check mirroring the coverage gate verdict.
 */
export function coverageGateChecks(result: CoverageGateResult): readonly QualityCheck[] {
  return [
    {
      id: 'test-coverage/gate',
      question: 'Does the coverage gate pass for every reported file?',
      status: result.passed ? 'pass' : 'fail',
      evidence: result.summary,
    },
  ]
}

/**
 * Turn a completion claim into a quality check on its support. Fact-grade
 * evidence passes, a failed verification fails, and weaker or absent evidence
 * is `not-run`, because an unsupported claim is unverified rather than
 * refuted.
 *
 * @param claim - the claim and its evidence.
 * @returns a quality check recording the claim's support status.
 */
export function claimSupportCheck(claim: Claim): QualityCheck {
  const support = classifyClaimSupport(claim)
  const status: QualityCheckStatus = isClaimSupported(claim)
    ? 'pass'
    : support === 'failed-verification'
      ? 'fail'
      : 'not-run'
  return {
    id: 'verification/claim-support',
    question: 'Is the completion claim backed by fact-grade evidence?',
    status,
    evidence: `strongest evidence category: ${support}`,
  }
}

/**
 * Build the `not-run` check standing in for a category the caller did not
 * evaluate.
 *
 * @param category - category left unevaluated.
 * @param supplied - whether the caller supplied the category with an empty check list.
 * @returns one `not-run` check naming why nothing was evaluated.
 */
function synthesizedInputCheck(category: QualityCategory, supplied: boolean): QualityCheck {
  return {
    id: `${category}/input-supplied`,
    question: `Were the ${category} checks run and recorded?`,
    status: 'not-run',
    evidence: supplied
      ? `${category} input supplied without checks`
      : `no ${category} input supplied`,
  }
}

/**
 * Project a check into a reportable failure or not-run finding.
 *
 * @param category - category the check belongs to.
 * @param check - the offending check.
 * @returns the finding, carrying the check's evidence when one is recorded.
 */
function toFinding(category: QualityCategory, check: QualityCheck): QualityGateFinding {
  return {
    category,
    checkId: check.id,
    question: check.question,
    ...(check.evidence !== undefined ? { evidence: check.evidence } : {}),
  }
}

/**
 * Evaluate the six-category quality gate over caller-supplied outcomes.
 *
 * Verdict rules: any `fail` check makes `overallStatus` `fail`; with no
 * failure, any `not-run` check makes it `blocked`; only `pass` and
 * `not-applicable` checks allow `pass`. A status outside the four values
 * counts as `fail`, so an unrecognized value never reads as verified. A
 * category missing from `inputs`, or supplied with an empty check list,
 * contributes one synthesized `not-run` check, so partial input cannot
 * silently pass. Results and findings follow `QUALITY_CATEGORIES` order no
 * matter how `inputs` are ordered, and inputs are never mutated.
 *
 * @param inputs - one entry per category the caller evaluated.
 * @returns the category results, overall verdict, failure and not-run findings, and substitute-for-tests flag.
 * @throws Error when an input names an unknown category or repeats one.
 */
export function evaluateGameQualityGate(inputs: readonly QualityCategoryInput[]): QualityGateResult {
  const supplied = new Map<QualityCategory, readonly QualityCheck[]>()
  for (const input of inputs) {
    if (!QUALITY_CATEGORIES.includes(input.category)) {
      throw new Error(`unknown quality category: ${String(input.category)}`)
    }
    if (supplied.has(input.category)) {
      throw new Error(`duplicate quality category: ${input.category}`)
    }
    supplied.set(input.category, input.checks)
  }

  const results: QualityCategoryResult[] = []
  const failures: QualityGateFinding[] = []
  const notRun: QualityGateFinding[] = []

  for (const category of QUALITY_CATEGORIES) {
    const suppliedChecks = supplied.get(category)
    const present = suppliedChecks !== undefined
    const checks = present && suppliedChecks.length > 0
      ? [...suppliedChecks]
      : [synthesizedInputCheck(category, present)]
    let failed = false
    let pending = false
    for (const check of checks) {
      if (check.status === 'not-run') {
        pending = true
        notRun.push(toFinding(category, check))
      } else if (check.status !== 'pass' && check.status !== 'not-applicable') {
        failed = true
        failures.push(toFinding(category, check))
      }
    }
    results.push({ category, checks, status: failed ? 'fail' : pending ? 'blocked' : 'pass' })
  }

  const overallStatus: QualityGateStatus = failures.length > 0
    ? 'fail'
    : notRun.length > 0
      ? 'blocked'
      : 'pass'
  return {
    overallStatus,
    results,
    failures,
    notRun,
    substituteForTests: QUALITY_GATE_SUBSTITUTE_FOR_TESTS,
  }
}
