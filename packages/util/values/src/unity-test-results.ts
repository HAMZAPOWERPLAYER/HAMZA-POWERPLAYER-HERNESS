/**
 * Read the summary and the failures from a Unity Test Runner NUnit-style XML
 * report. The reader scans the text with regular expressions instead of using
 * an XML parser, so it reads double-quoted attributes in any order and tolerates
 * extra whitespace, but it cannot resolve XML entities, namespace prefixes, or
 * CDATA nesting beyond the documented forms.
 *
 * All helpers are deterministic, hold no state, and perform no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/unity-test-results
 */

/** Aggregate counts read from a `<test-run>` element. */
export interface UnityTestRunSummary {
  /** Total number of tests in the run. */
  readonly total: number
  /** Number of tests that passed. */
  readonly passed: number
  /** Number of tests that failed. */
  readonly failed: number
  /** Number of tests that were skipped. */
  readonly skipped: number
  /** Number of tests that were inconclusive. */
  readonly inconclusive: number
  /** Run duration in seconds, or `null` when the attribute is absent or not a finite number. */
  readonly durationSeconds: number | null
  /** Reported result string, or `null` when the attribute is absent. */
  readonly result: string | null
}

/** One failed test case read from a `<test-case>` element. */
export interface UnityFailedTest {
  /** Test name. */
  readonly name: string
  /** Full test name, or `null` when the attribute is absent. */
  readonly fullname: string | null
  /** Failure message, or `null` when no message element is present. */
  readonly message: string | null
}

/** Read aggregate counts from the `<test-run>` element. */
/** Read aggregate counts from the `<test-run>` element.
 * @param xml - report text.
 * @returns the parsed summary.
 */
export function parseTestRunSummary(xml: string): UnityTestRunSummary {
  const total = readIntAttribute(xml, 'test-run', 'total')
  const passed = readIntAttribute(xml, 'test-run', 'passed')
  const failed = readIntAttribute(xml, 'test-run', 'failed')
  const skipped = readIntAttribute(xml, 'test-run', 'skipped')
  const inconclusive = readIntAttribute(xml, 'test-run', 'inconclusive')
  const duration = readNumberAttribute(xml, 'test-run', 'duration')
  const result = readStringAttribute(xml, 'test-run', 'result')
  return { total, passed, failed, skipped, inconclusive, durationSeconds: duration, result }
}

/** Read every failed test case from the report, in document order. */
/** Read every failed test case from the report, in document order.
 * @param xml - report text.
 * @returns the failed test cases.
 */
export function parseFailedTests(xml: string): readonly UnityFailedTest[] {
  const results: UnityFailedTest[] = []
  const seen = new Set<string>()
  const testCasePattern = /<test-case\b[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = testCasePattern.exec(xml)) !== null) {
    const tag = match[0]
    if (!/\bresult\s*=\s*"Failed"/.test(tag)) continue
    const name = readAttributeFromTag(tag, 'name')
    if (name === null) continue
    const fullname = readAttributeFromTag(tag, 'fullname')
    const message = readMessage(xml, match.index + tag.length)
    const key = `${name}\u0000${fullname ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ name, fullname, message })
  }
  return results
}

/** Render one summary line. */
/** Render one summary line.
 * @param summary - parsed summary.
 * @returns the summary line.
 */
export function formatTestRunSummary(summary: UnityTestRunSummary): string {
  const duration = summary.durationSeconds === null ? 'unknown' : String(summary.durationSeconds)
  const result = summary.result ?? 'unknown'
  return `total=${summary.total} passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped} inconclusive=${summary.inconclusive} duration=${duration}s result=${result}`
}

/** Whether the run is fully green. */
/** Whether the run is fully green.
 * @param summary - parsed summary.
 * @returns whether the run is green.
 */
export function isUnityRunGreen(summary: UnityTestRunSummary): boolean {
  return summary.total > 0 && summary.failed === 0 && summary.inconclusive === 0 && summary.result === 'Passed'
}

function readAttributeFromTag(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`)
  const match = pattern.exec(tag)
  return match === null ? null : (match[1] ?? null)
}

function readIntAttribute(xml: string, element: string, name: string): number {
  const value = readAttribute(xml, element, name)
  if (value === null) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function readNumberAttribute(xml: string, element: string, name: string): number | null {
  const value = readAttribute(xml, element, name)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readStringAttribute(xml: string, element: string, name: string): string | null {
  return readAttribute(xml, element, name)
}

function readAttribute(xml: string, element: string, name: string): string | null {
  const elementPattern = new RegExp(`<${element}\\b[^>]*>`, 'i')
  const elementMatch = elementPattern.exec(xml)
  if (elementMatch === null) return null
  return readAttributeFromTag(elementMatch[0], name)
}

function readMessage(xml: string, startIndex: number): string | null {
  const rest = xml.slice(startIndex)
  const cdataMatch = /<message>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/message>/.exec(rest)
  if (cdataMatch !== null) return trimMessage(cdataMatch[1] ?? '')
  const plainMatch = /<message>([\s\S]*?)<\/message>/.exec(rest)
  if (plainMatch !== null) return trimMessage(plainMatch[1] ?? '')
  return null
}

function trimMessage(value: string): string {
  let result = value
  if (result.startsWith('\n')) result = result.slice(1)
  if (result.endsWith('\n')) result = result.slice(0, -1)
  return result.trim()
}
