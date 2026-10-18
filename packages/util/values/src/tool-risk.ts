/**
 * Pure risk-level helpers for classifying tool invocations by their potential
 * impact and deciding approval/escalation consequences.
 *
 * All helpers are deterministic, hold no state, and perform no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/tool-risk
 */

/** Ordered severity of a tool invocation's risk. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** Numeric rank of each {@link RiskLevel}, increasing with severity. */
export const RISK_LEVEL_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

/**
 * Compare two risk levels by severity.
 *
 * @param a - first risk level.
 * @param b - second risk level.
 * @returns a negative number when `a` is less severe than `b`, zero when equal,
 *   and a positive number when `a` is more severe than `b`.
 */
export function compareRisk(a: RiskLevel, b: RiskLevel): number {
  return RISK_LEVEL_RANK[a] - RISK_LEVEL_RANK[b]
}

/**
 * Whether a risk level is high or critical.
 *
 * @param level - risk level to test.
 * @returns `true` for `'high'` and `'critical'`.
 */
export function isHighRisk(level: RiskLevel): boolean {
  return level === 'high' || level === 'critical'
}

/**
 * Whether a risk level requires explicit approval before execution.
 *
 * Only consequential or destructive levels (`'high'` and `'critical'`) require
 * approval; `'medium'` does not.
 *
 * @param level - risk level to test.
 * @returns `true` for `'high'` and `'critical'`.
 */
export function requiresApproval(level: RiskLevel): boolean {
  return level === 'high' || level === 'critical'
}

/**
 * Return the most severe risk level in `levels`, or `'low'` when empty.
 *
 * @param levels - risk levels to reduce.
 * @returns the maximum-severity risk level.
 */
export function maxRisk(levels: readonly RiskLevel[]): RiskLevel {
  let result: RiskLevel = 'low'
  for (const level of levels) {
    if (compareRisk(level, result) > 0) result = level
  }
  return result
}

/**
 * Human-readable label for a risk level, with the first letter capitalized.
 *
 * @param level - risk level to label.
 * @returns a label such as `'Low risk'`.
 */
export function riskLabel(level: RiskLevel): string {
  const base = `${level} risk`
  return base.charAt(0).toUpperCase() + base.slice(1)
}
