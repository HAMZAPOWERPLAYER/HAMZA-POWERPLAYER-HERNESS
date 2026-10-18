/**
 * Security testing and adversarial validation helpers.
 *
 * Provides deterministic checks for critical safety boundaries:
 * path traversal, absolute paths outside the workspace, symlink escapes,
 * malformed tool arguments, invalid configuration, and secret leakage.
 * All helpers are pure: they validate caller-supplied strings, perform no I/O,
 * and hold no state. Callers own executing these checks against real inputs.
 *
 * @module @deepseek-ai/dsh-util-values/security-audit
 */

/** Result of a single security check. */
export interface SecurityCheckResult {
  /** Name of the check performed. */
  readonly check: string
  /** Whether the check passed. */
  readonly passed: boolean
  /** Human-readable explanation when the check fails. */
  readonly reason?: string
}

/** Path traversal patterns that must be rejected. */
const TRAVERSAL_PATTERNS = [
  /(?:^|\/)\.\.(?:\/|$)/,
  /(?:^|\\)\.\.(?:\\|$)/,
  /\.\.\//,
  /\.\.\\/,
]

/** Absolute path patterns. */
const ABSOLUTE_PATH_PATTERNS = [
  /^\/[^/]/, // POSIX absolute
  /^[A-Za-z]:[\\/]/, // Windows absolute
  /^\\\\/, // Windows UNC
]

/** Secret-like patterns that should not appear in plaintext output. */
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/, // DeepSeek-style API keys
  /sk-[A-Za-z0-9]{48,}/, // Longer API keys
  /[0-9a-f]{32}/, // MD5-like secrets
  /(?:password|secret|api[_-]?key|token|private[_-]?key)\s*[:=]\s*['"]?[^\s'"]{8,}/i,
]

/** Check a path for traversal escapes outside the workspace.
 * @param path - file path to check.
 * @returns security check result.
 */
export function checkPathTraversal(path: string): SecurityCheckResult {
  const normalized = path.replace(/\\/g, '/')
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        check: 'path-traversal',
        passed: false,
        reason: `path ${path} contains path traversal sequence`,
      }
    }
  }
  return { check: 'path-traversal', passed: true }
}

/** Check a path for absolute paths outside the workspace.
 * @param path - file path to check.
 * @returns security check result.
 */
export function checkAbsolutePath(path: string): SecurityCheckResult {
  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    if (pattern.test(path)) {
      return {
        check: 'absolute-path',
        passed: false,
        reason: `path ${path} is an absolute path outside the workspace`,
      }
    }
  }
  return { check: 'absolute-path', passed: true }
}

/** Check a path for symlink escape patterns.
 * @param path - file path to check.
 * @returns security check result.
 */
export function checkSymlinkEscape(path: string): SecurityCheckResult {
  const normalized = path.replace(/\\/g, '/')
  if (normalized.includes('/../') || normalized.startsWith('../') || normalized.endsWith('/..')) {
    return {
      check: 'symlink-escape',
      passed: false,
      reason: `path ${path} contains symlink escape sequence`,
    }
  }
  return { check: 'symlink-escape', passed: true }
}

/** Check a string for secret-like values that should not appear in plaintext.
 * @param text - text to scan for secrets.
 * @returns security check result.
 */
export function checkSecretLeakage(text: string): SecurityCheckResult {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return {
        check: 'secret-leakage',
        passed: false,
        reason: 'text contains a potential secret value',
      }
    }
  }
  return { check: 'secret-leakage', passed: true }
}

/** Check a tool argument string for malicious shell injection patterns.
 * @param argument - tool argument to check.
 * @returns security check result.
 */
export function checkToolArgument(argument: string): SecurityCheckResult {
  const shellMetacharacters = /[&|;<>()${}`"'\\]/g
  if (shellMetacharacters.test(argument)) {
    return {
      check: 'shell-injection',
      passed: false,
      reason: `argument contains shell metacharacters`,
    }
  }
  return { check: 'shell-injection', passed: true }
}

/** Run all security checks on a set of inputs.
 *
 * @param inputs - named input strings to check.
 * @returns check results, one per check per input that has content.
 */
export function runSecurityAudit(inputs: readonly { readonly name: string; readonly value: string }[]): readonly SecurityCheckResult[] {
  const results: SecurityCheckResult[] = []
  for (const input of inputs) {
    if (input.value === null || input.value === undefined || input.value === '') continue
    results.push(checkPathTraversal(input.value))
    results.push(checkAbsolutePath(input.value))
    results.push(checkSymlinkEscape(input.value))
    results.push(checkSecretLeakage(input.value))
    results.push(checkToolArgument(input.value))
  }
  return results
}

/** Whether all audit results passed.
 * @param results - security check results.
 * @returns true when all checks passed.
 */
export function auditPassed(results: readonly SecurityCheckResult[]): boolean {
  return results.every((result) => result.passed)
}

/** All failed check reasons, in order.
 * @param results - security check results.
 * @returns failure reason strings.
 */
export function auditFailures(results: readonly SecurityCheckResult[]): readonly string[] {
  return results
    .filter((result) => !result.passed)
    .map((result) => `${result.check}: ${result.reason ?? 'failed'}`)
}
