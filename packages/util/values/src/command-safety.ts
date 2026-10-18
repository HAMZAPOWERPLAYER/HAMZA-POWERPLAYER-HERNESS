/**
 * Heuristic risk scoring for shell commands described by a {@link CommandPlan}.
 *
 * Scores are derived from the executable name and argument text without executing
 * anything; they are a heuristic, not a sandbox.
 *
 * @module @deepseek-ai/dsh-util-values/command-safety
 */

import { isSafeExecutableName } from './command-plan.ts'
import { RISK_LEVEL_RANK } from './tool-risk.ts'
import type { CommandPlan } from './command-plan.ts'
import type { RiskLevel } from './tool-risk.ts'

/** Metacharacters that make an argument dangerous to interpolate into a shell. */
const METACHARACTERS = [';', '&', '|', '<', '>', '`', '$', '\n'] as const

/** Risk assessment for a command plan. */
export interface CommandRiskAssessment {
  /** Numeric risk score accumulated from the triggered reasons. */
  readonly score: number
  /** Risk level derived from {@link CommandRiskAssessment.score}. */
  readonly level: RiskLevel
  /** Triggered risk reasons, in evaluation order, without duplicates. */
  readonly reasons: readonly string[]
}

/**
 * Split an argument into path segments on both `/` and `\`.
 *
 * @param argument - argument to split.
 * @returns the resulting path segments.
 */
function pathSegments(argument: string): readonly string[] {
  return argument.split(/[\\/]/)
}

/**
 * Whether an argument contains `..` as a whole path segment.
 *
 * @param argument - argument to test.
 * @returns `true` when a segment equals `..`.
 */
function hasPathTraversal(argument: string): boolean {
  return pathSegments(argument).some((segment) => segment === '..')
}

/**
 * Whether an argument starts with an absolute path marker.
 *
 * @param argument - argument to test.
 * @returns `true` when the argument starts with `/` or a drive letter.
 */
function hasAbsolutePath(argument: string): boolean {
  if (argument.startsWith('/')) return true
  return /^[a-zA-Z]:/.test(argument)
}

/**
 * Whether an argument contains a shell metacharacter.
 *
 * @param argument - argument to test.
 * @returns `true` when any metacharacter is present.
 */
function hasMetacharacter(argument: string): boolean {
  return METACHARACTERS.some((character) => argument.includes(character))
}

/**
 * Score a command plan for risk using its executable name and argument text.
 *
 * The score and level are a heuristic for review and gating, not a sandbox:
 * a command that scores low is not guaranteed safe to execute.
 *
 * @param plan - command plan to assess.
 * @returns the risk assessment.
 */
export function assessCommandRisk(plan: CommandPlan): CommandRiskAssessment {
  const reasons: string[] = []
  let score = 0

  if (!isSafeExecutableName(plan.executable)) {
    reasons.push('executable is not on the safe-name list')
    score += 40
  }

  let metacharacter = false
  let traversal = false
  let absolute = false
  let tooLong = false
  for (const argument of plan.args) {
    if (!metacharacter && hasMetacharacter(argument)) metacharacter = true
    if (!traversal && hasPathTraversal(argument)) traversal = true
    if (!absolute && hasAbsolutePath(argument)) absolute = true
    if (!tooLong && argument.length > 4096) tooLong = true
  }

  if (metacharacter) {
    reasons.push('argument contains a shell metacharacter')
    score += 30
  }
  if (traversal) {
    reasons.push('argument contains a path traversal')
    score += 20
  }
  if (absolute) {
    reasons.push('argument contains an absolute path')
    score += 10
  }
  if (tooLong) {
    reasons.push('argument is unusually long')
    score += 5
  }

  let level: RiskLevel
  if (score >= 60) level = 'critical'
  else if (score >= 40) level = 'high'
  else if (score >= 20) level = 'medium'
  else level = 'low'

  return { score, level, reasons }
}

/**
 * Render a human-readable explanation of a risk assessment.
 *
 * @param assessment - assessment to explain.
 * @returns the explanation string.
 */
export function commandRiskExplanation(assessment: CommandRiskAssessment): string {
  if (assessment.reasons.length === 0) {
    return 'command risk: low (no risk factors)'
  }
  return `command risk: ${assessment.level} (${assessment.reasons.join('; ')})`
}

/**
 * Whether an assessment is allowed under a maximum risk level.
 *
 * @param assessment - assessment to test.
 * @param maximumLevel - highest permitted risk level.
 * @returns `true` when the assessment level is no more severe than `maximumLevel`.
 */
export function isCommandAllowed(
  assessment: CommandRiskAssessment,
  maximumLevel: RiskLevel,
): boolean {
  return RISK_LEVEL_RANK[assessment.level] <= RISK_LEVEL_RANK[maximumLevel]
}
