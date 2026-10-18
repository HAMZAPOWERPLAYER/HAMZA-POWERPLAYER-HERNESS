/**
 * Static lifecycle-safety checks over in-memory game script sources.
 *
 * `auditScriptLifecycle` reads one C# or GDScript source text and reports
 * subscription hazards: a handler that is subscribed but never unsubscribed,
 * an unsubscribe with no subscribe, the same handler subscribed twice, an
 * anonymous subscription with no nameable handle, and a subscription that
 * repeats on every iteration of a loop. For C# sources it also reports an
 * `async void` method, a `new` allocation inside `Update`, `FixedUpdate`, or
 * `LateUpdate`, a `Time.timeScale` set to zero, and an `OnEnable` or
 * `OnDisable` message declared without its counterpart. `auditLifecycleBatch`
 * runs the same checks over several scripts and totals the findings by
 * severity. The checks complement the Unity and Godot project diagnostics:
 * those read project files, while these read script text.
 *
 * These checks are static heuristics over line-oriented text. They can
 * report a false positive and they can miss a real hazard, and a finding is
 * not runtime proof that a leak, a duplicate invocation, a stale handler, an
 * unobserved exception, a per-frame allocation, or a pause without a restore
 * ever happens. Pairing is decided inside one source text, so a handler
 * subscribed in one file and torn down in another is reported as unpaired.
 * Comments are removed and string literals are blanked before matching, but
 * multi-line statements are read one line at a time.
 *
 * Every function is pure: it reads only its arguments, performs no I/O, and
 * keeps no state between calls, so the same input always yields the same
 * result.
 *
 * @module @deepseek-ai/dsh-util-values/game-lifecycle-audit
 */

/** Script languages the audit accepts. */
export type ScriptLanguage = 'csharp' | 'gdscript'

/** Severity of one lifecycle finding. */
export type LifecycleSeverity = 'info' | 'warning' | 'error'

/** One lifecycle hazard reported at one line of one script source. */
export interface LifecycleFinding {
  /** Stable identifier of the check that reported the finding. */
  readonly id: string
  /** Check family the identifier belongs to. */
  readonly category: string
  /** Severity of the finding. */
  readonly severity: LifecycleSeverity
  /** Human-readable description of the hazard. */
  readonly message: string
  /** 1-based line number of the hazard in the supplied source. */
  readonly line: number
  /** File name supplied for the audited source. */
  readonly file: string
}

/** Result of auditing one script source. */
export interface LifecycleAuditResult {
  /** Findings ordered by line number, then by check identifier. */
  readonly findings: readonly LifecycleFinding[]
}

/** One script source handed to {@link auditLifecycleBatch}. */
export interface ObservedScript {
  /** Script text to audit. */
  readonly source: string
  /** Language the text is written in. */
  readonly language: ScriptLanguage
  /** File name reported on every finding from this script. */
  readonly fileName: string
}

/** Finding totals for one severity each. */
export interface LifecycleSeverityCounts {
  /** Findings with `info` severity, reported by the `time-scale-pause` check. */
  readonly info: number
  /** Findings with `warning` severity. */
  readonly warning: number
  /** Findings with `error` severity. */
  readonly error: number
}

/** Result of auditing a batch of script sources. */
export interface LifecycleBatchResult {
  /** Every finding from every script, ordered by input script, then line, then check identifier. */
  readonly findings: readonly LifecycleFinding[]
  /** Number of scripts audited. */
  readonly scriptCount: number
  /** Totals of `findings` grouped by severity. */
  readonly counts: LifecycleSeverityCounts
}

/** One source line with its number, raw text, and comment-free code text. */
interface CodeLine {
  /** 1-based line number. */
  readonly number: number
  /** Line text without its terminator. */
  readonly raw: string
  /** Line text with string literals blanked and the trailing comment removed. */
  readonly code: string
}

/** One subscription or unsubscription site read from a line. */
interface SubscriptionRef {
  /** 1-based line number of the site. */
  readonly line: number
  /** Receiver and handler text that pairs a subscribe with an unsubscribe. */
  readonly key: string
  /** Displayed spelling of the site, including its operator. */
  readonly display: string
  /** Receiver expression the handler is attached to. */
  readonly receiver: string
  /** Whether the handler is a lambda or `delegate` expression with no name. */
  readonly anonymous: boolean
}

/** Subscription and unsubscription sites read from one source. */
interface SubscriptionSites {
  /** Sites that add a handler, in line order. */
  readonly subscriptions: readonly SubscriptionRef[]
  /** Sites that remove a handler, in line order. */
  readonly unsubscribes: readonly SubscriptionRef[]
}

/** Pattern that starts a C# loop header; non-global, so `exec` keeps no state. */
const CSHARP_LOOP = /(?:foreach|for|while)\s*\(|\bdo\b/

/** Pattern that starts a GDScript loop header; non-global, so `test` keeps no state. */
const GDSCRIPT_LOOP = /^(?:for|while)\b/

/** Pattern that starts a C# `async void` method declaration; non-global, so `exec` keeps no state. */
const CSHARP_ASYNC_VOID = /\basync\b[^;{()=]*?\bvoid\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/

/** Pattern that starts a C# per-frame method declaration; non-global, so `exec` keeps no state. */
const CSHARP_PER_FRAME = /\bvoid\s+(FixedUpdate|LateUpdate|Update)\s*\(/

/** Pattern that reads a `new` allocation; global, so `matchAll` keeps no state. */
const CSHARP_NEW = /\bnew\s*([A-Za-z_]\w*|\()/g

/** Pattern of a modifier keyword that follows `new` as member hiding, not as an allocation. */
const CSHARP_NEW_MODIFIERS =
  /^(?:abstract|async|base|class|delegate|enum|extern|get|in|interface|internal|new|out|override|params|partial|private|protected|public|readonly|ref|return|sealed|set|static|struct|this|unsafe|virtual|void|where|when)$/

/** Pattern that sets Unity's `Time.timeScale` to zero; non-global, so `test` keeps no state. */
const TIME_SCALE_PAUSE = /\bTime\.timeScale\s*=\s*0(?:\.0*)?f?(?![\d.])/

/** Pattern that starts a C# Unity message method declaration; non-global, so `exec` keeps no state. */
const UNITY_MESSAGE = /\bvoid\s+(OnEnable|OnDisable)\s*\(/

/**
 * Audit one script source for subscription lifecycle hazards.
 *
 * The source is read line by line: lines whose code part is empty, because
 * they hold only a comment, take part in no check, so an empty or
 * comment-only source yields no finding. A subscription and an unsubscription
 * pair when their receiver and handler text match, independently of order and
 * of the method they appear in. The `duplicate-subscription` check reports
 * every repeat of one receiver and handler beyond the first. The
 * `anonymous-subscription` check reports a lambda or `delegate` handler,
 * which a teardown method cannot name. The `loop-subscription` check reports
 * a subscription inside a loop body when the receiver shares no identifier
 * with the loop header, so the same receiver is subscribed on every
 * iteration. For C# sources, the `async-void-method` check reports a method
 * declared `async void`, the `per-frame-allocation` check reports a `new`
 * expression inside the body of `Update`, `FixedUpdate`, or `LateUpdate`, the
 * `time-scale-pause` check reports a `Time.timeScale` set to zero, and the
 * `unpaired-unity-message` check reports `OnEnable` without `OnDisable` or
 * `OnDisable` without `OnEnable`. These are static heuristics and each one
 * can report a false positive; a finding is not runtime proof of a hazard.
 *
 * @param source - full script text to audit.
 * @param language - language the text is written in.
 * @param fileName - file name reported on every finding.
 * @returns the findings ordered by line number, then by check identifier.
 * @throws Error when `language` is neither `csharp` nor `gdscript`.
 */
export function auditScriptLifecycle(
  source: string,
  language: ScriptLanguage,
  fileName: string,
): LifecycleAuditResult {
  if (language !== 'csharp' && language !== 'gdscript') {
    throw new Error(`unsupported language: ${String(language)}`)
  }
  const lines = readLines(source, language)
  const allCode = lines.map((line) => line.code).join('\n')
  const sites = language === 'csharp' ? readCsharpSites(lines, allCode) : readGdscriptSites(lines)
  const findings = collectFindings(lines, sites, language, fileName)
  findings.sort(compareFindings)
  return { findings }
}

/**
 * Audit a list of script sources and total the findings by severity.
 *
 * Findings keep the input order of `scripts`; inside one script they stay
 * ordered by line number, then by check identifier, so the same input always
 * produces the same list.
 *
 * @param scripts - script sources with their languages and file names.
 * @returns every finding in stable order, the number of scripts audited, and the counts per severity.
 * @throws Error when a script carries a language other than `csharp` or `gdscript`.
 */
export function auditLifecycleBatch(scripts: readonly ObservedScript[]): LifecycleBatchResult {
  const findings: LifecycleFinding[] = []
  for (const script of scripts) {
    findings.push(...auditScriptLifecycle(script.source, script.language, script.fileName).findings)
  }
  const counts = { info: 0, warning: 0, error: 0 }
  for (const item of findings) {
    if (item.severity === 'error') counts.error += 1
    else if (item.severity === 'warning') counts.warning += 1
    else counts.info += 1
  }
  return { findings, scriptCount: scripts.length, counts }
}

/**
 * Blank out string literals and drop the trailing line comment of one line.
 *
 * @param raw - one source line without its terminator.
 * @param language - language that decides the comment marker.
 * @returns the line with quoted spans replaced by spaces and everything from the comment marker removed.
 */
function stripLine(raw: string, language: ScriptLanguage): string {
  const withoutStrings = raw.replace(
    /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
    (match) => ' '.repeat(match.length),
  )
  const marker = language === 'csharp' ? '//' : '#'
  const cut = withoutStrings.indexOf(marker)
  return (cut === -1 ? withoutStrings : withoutStrings.slice(0, cut)).trimEnd()
}

/**
 * Split a source into numbered code lines.
 *
 * @param source - full script text.
 * @param language - language used to strip comments.
 * @returns every line with its 1-based number and comment-free code text.
 */
function readLines(source: string, language: ScriptLanguage): CodeLine[] {
  const lines: CodeLine[] = []
  let number = 0
  for (const raw of source.split(/\r\n|\n|\r/)) {
    number += 1
    lines.push({ number, raw, code: stripLine(raw, language) })
  }
  return lines
}

/**
 * Collapse whitespace so two spellings of one expression compare equal.
 *
 * @param text - expression text.
 * @returns the text with every whitespace run replaced by one space and the ends trimmed.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Read the identifier tokens of one expression.
 *
 * @param text - expression text.
 * @returns every identifier that appears in the text.
 */
function identifiers(text: string): Set<string> {
  const names = new Set<string>()
  for (const match of text.matchAll(/[A-Za-z_]\w*/g)) {
    const name = match[0]
    if (name !== undefined) names.add(name)
  }
  return names
}

/**
 * Decide whether two expressions share an identifier.
 *
 * @param left - first expression text.
 * @param right - second expression text.
 * @returns `true` when both spell at least one identical identifier.
 */
function identifiersOverlap(left: string, right: string): boolean {
  const leftNames = identifiers(left)
  for (const name of identifiers(right)) {
    if (leftNames.has(name)) return true
  }
  return false
}

/**
 * Decide whether the right side of a C# combine assignment is a handler.
 *
 * A lambda or `delegate` expression can only be combined with an event or
 * delegate field, and a bare identifier counts as a handler only when the
 * same source also spells it as a call, which the right side of arithmetic
 * never is.
 *
 * @param rhs - right side text with whitespace collapsed.
 * @param allCode - comment-free text of the whole source, used to look the identifier up as a call.
 * @returns `true` when the assignment adds or removes a handler.
 */
function isCsharpHandler(rhs: string, allCode: string): boolean {
  if (rhs.includes('=>')) return true
  if (/^delegate\b/.test(rhs)) return true
  if (!/^[A-Za-z_][\w.]*$/.test(rhs)) return false
  return allCode.includes(`${rhs}(`)
}

/**
 * Read event subscriptions and unsubscriptions from C# code lines.
 *
 * @param lines - numbered lines with comments removed.
 * @param allCode - comment-free text of the whole source.
 * @returns the `+=` handler sites and the `-=` handler sites, each in line order.
 */
function readCsharpSites(lines: readonly CodeLine[], allCode: string): SubscriptionSites {
  const subscriptions: SubscriptionRef[] = []
  const unsubscribes: SubscriptionRef[] = []
  for (const line of lines) {
    for (const match of line.code.matchAll(/([A-Za-z_][\w.]*)\s*([+-])=\s*([^;]*)/g)) {
      const lhs = normalize(match[1] ?? '')
      const operator = match[2] ?? ''
      const rhs = normalize(match[3] ?? '')
      if (rhs === '' || !isCsharpHandler(rhs, allCode)) continue
      const ref: SubscriptionRef = {
        line: line.number,
        key: `${lhs}::${rhs}`,
        display: `${lhs} ${operator}= ${rhs}`,
        receiver: lhs,
        anonymous: rhs.includes('=>') || /^delegate\b/.test(rhs),
      }
      if (operator === '+') subscriptions.push(ref)
      else unsubscribes.push(ref)
    }
  }
  return { subscriptions, unsubscribes }
}

/**
 * Read the first argument of one signal call.
 *
 * @param text - text following the opening parenthesis of the call.
 * @returns the first argument, stopping at the first comma or closing parenthesis at nesting level zero.
 */
function firstArgument(text: string): string {
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '(' || character === '[' || character === '{') depth += 1
    else if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) return normalize(text.slice(0, index))
      depth -= 1
    } else if (character === ',' && depth === 0) return normalize(text.slice(0, index))
  }
  return normalize(text)
}

/**
 * Read one kind of signal call from every GDScript code line.
 *
 * @param lines - numbered lines with comments removed.
 * @param callPattern - global pattern matching the call keyword and its opening parenthesis.
 * @param label - call spelling used in the displayed text, such as `.connect(`.
 * @param into - array the discovered sites are appended to, in line order.
 */
function collectGdscriptCalls(
  lines: readonly CodeLine[],
  callPattern: RegExp,
  label: string,
  into: SubscriptionRef[],
): void {
  for (const line of lines) {
    for (const match of line.code.matchAll(callPattern)) {
      const start = match.index ?? 0
      const receiver = normalize(line.code.slice(0, start).replace(/[\s.]+$/, ''))
      const argument = firstArgument(line.code.slice(start + (match[0]?.length ?? 0)))
      const call = receiver === '' ? `${label.slice(1)}${argument})` : `${receiver}${label}${argument})`
      into.push({
        line: line.number,
        key: `${receiver}::${argument}`,
        display: call,
        receiver,
        anonymous: /^func\b/.test(argument),
      })
    }
  }
}

/**
 * Read signal connections and disconnections from GDScript code lines.
 *
 * @param lines - numbered lines with comments removed.
 * @returns the `connect` sites and the `disconnect` sites, each in line order.
 */
function readGdscriptSites(lines: readonly CodeLine[]): SubscriptionSites {
  const subscriptions: SubscriptionRef[] = []
  const unsubscribes: SubscriptionRef[] = []
  collectGdscriptCalls(lines, /\bconnect\s*\(/g, '.connect(', subscriptions)
  collectGdscriptCalls(lines, /\bdisconnect\s*\(/g, '.disconnect(', unsubscribes)
  return { subscriptions, unsubscribes }
}

/**
 * Group subscription sites by the receiver and handler they name.
 *
 * @param refs - sites in line order.
 * @returns the sites of each key, keeping the input order within one key.
 */
function groupByKey(refs: readonly SubscriptionRef[]): Map<string, SubscriptionRef[]> {
  const grouped = new Map<string, SubscriptionRef[]>()
  for (const ref of refs) {
    const bucket = grouped.get(ref.key)
    if (bucket === undefined) grouped.set(ref.key, [ref])
    else bucket.push(ref)
  }
  return grouped
}

/**
 * Take a C# loop header from its keyword through the closing parenthesis.
 *
 * @param code - one line with comments removed.
 * @param start - index of the loop keyword on the line.
 * @returns the header text through the balanced `)`, or the rest of the line when no parenthesis closes.
 */
function parenthesizedText(code: string, start: number): string {
  let depth = 0
  for (let index = start; index < code.length; index += 1) {
    const character = code[index]
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) return code.slice(start, index + 1)
    }
  }
  return code.slice(start)
}

/**
 * Read the header text of a C# loop that starts on one line.
 *
 * A `while` that closes a `do` block carries no header, so a line whose text
 * before the keyword holds a closing brace starts no loop.
 *
 * @param code - one line with comments removed.
 * @returns the loop header text, or `null` when the line starts no loop.
 */
function loopHeader(code: string): string | null {
  const match = CSHARP_LOOP.exec(code)
  if (match === null) return null
  if (code.slice(0, match.index).includes('}')) return null
  return parenthesizedText(code, match.index)
}

/**
 * Read the innermost C# loop header that is still open.
 *
 * @param stack - one entry per open brace, holding the header that opened it or `null`.
 * @returns the header of the innermost open loop, or `undefined` when no loop is open.
 */
function innermostLoopHeader(stack: readonly (string | null)[]): string | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index]
    if (entry !== null && entry !== undefined) return entry
  }
  return undefined
}

/**
 * Map each line inside a C# loop body to that loop's header text.
 *
 * Brace depth decides the body: a `{` opened while a loop header is current
 * or pending opens the loop, and a braceless loop body is the single line
 * after its header.
 *
 * @param lines - numbered lines with comments removed.
 * @returns line number to loop header text for every line inside a loop.
 */
function collectCsharpLoopScopes(lines: readonly CodeLine[]): Map<number, string> {
  const scopes = new Map<number, string>()
  const stack: Array<string | null> = []
  let pending: string | null = null
  for (const line of lines) {
    const code = line.code
    if (code.trim() === '') continue
    const header = loopHeader(code)
    const scope = pending ?? header ?? innermostLoopHeader(stack)
    if (scope !== undefined) scopes.set(line.number, scope)
    let opened = false
    for (const character of code) {
      if (character === '{') {
        stack.push(pending ?? header)
        opened = true
        pending = null
      } else if (character === '}') {
        stack.pop()
        pending = null
      }
    }
    pending = opened ? null : header
  }
  return scopes
}

/**
 * Read the condition text of a GDScript loop header.
 *
 * @param code - one header line with comments removed.
 * @returns the text before the block colon, or the whole line when no colon closes the header.
 */
function gdscriptHeader(code: string): string {
  const colon = code.indexOf(':')
  return colon === -1 ? code : code.slice(0, colon)
}

/**
 * Map each line inside a GDScript loop body to that loop's header text.
 *
 * Indentation decides the body: a loop header opens a scope that every
 * following line with a larger indentation belongs to.
 *
 * @param lines - numbered lines with comments removed.
 * @returns line number to loop header text for every line inside a loop.
 */
function collectGdscriptLoopScopes(lines: readonly CodeLine[]): Map<number, string> {
  const scopes = new Map<number, string>()
  const stack: Array<{ readonly indent: number; readonly header: string }> = []
  for (const line of lines) {
    const code = line.code
    if (code.trim() === '') continue
    const indent = line.raw.length - line.raw.trimStart().length
    for (;;) {
      const innermost = stack[stack.length - 1]
      if (innermost === undefined || indent > innermost.indent) break
      stack.pop()
    }
    const ownHeader = GDSCRIPT_LOOP.test(code.trimStart()) ? gdscriptHeader(code) : null
    const scope = ownHeader ?? stack[stack.length - 1]?.header
    if (scope !== undefined) scopes.set(line.number, scope)
    if (ownHeader !== null) stack.push({ indent, header: ownHeader })
  }
  return scopes
}

/**
 * Build one finding for a line of the audited source.
 *
 * @param id - stable check identifier.
 * @param category - check family the identifier belongs to.
 * @param severity - severity of the finding.
 * @param message - human-readable description of the hazard.
 * @param line - 1-based line number of the hazard.
 * @param file - file name supplied for the source.
 * @returns the finding ready to collect.
 */
function createFinding(
  id: string,
  category: string,
  severity: LifecycleSeverity,
  message: string,
  line: number,
  file: string,
): LifecycleFinding {
  return { id, category, severity, message, line, file }
}

/**
 * Report every C# `async void` method declaration in one source.
 *
 * `async void` is fire-and-forget: the caller cannot await the method and an
 * exception it throws is unobserved. The declaration must fit on one line, so
 * a method whose header spans several lines is not seen.
 *
 * @param lines - numbered lines with comments removed.
 * @param fileName - file name reported on each finding.
 * @param into - array the findings are appended to, in line order.
 */
function collectAsyncVoidFindings(
  lines: readonly CodeLine[],
  fileName: string,
  into: LifecycleFinding[],
): void {
  for (const line of lines) {
    const match = CSHARP_ASYNC_VOID.exec(line.code)
    const name = match?.[1]
    if (name === undefined) continue
    into.push(
      createFinding(
        'async-void-method',
        'async-void-method',
        'warning',
        `'async void ${name}()' is fire-and-forget; exceptions it throws are unobserved and cannot be awaited`,
        line.number,
        fileName,
      ),
    )
  }
}

/**
 * Report `new` expressions inside a C# per-frame method body.
 *
 * A body is the brace block of a `void Update`, `void FixedUpdate`, or
 * `void LateUpdate` declaration. The header line is not part of the body, so
 * a `new` member-hiding modifier on the declaration is not reported. An
 * expression-bodied handler has no body lines and is not seen. GDScript has
 * no `new` expression, so this check does not apply to it.
 *
 * @param lines - numbered lines with comments removed.
 * @param fileName - file name reported on each finding.
 * @param into - array the findings are appended to, in line order.
 */
function collectPerFrameAllocations(
  lines: readonly CodeLine[],
  fileName: string,
  into: LifecycleFinding[],
): void {
  for (const [number, name] of collectCsharpPerFrameBodies(lines)) {
    const line = lines[number - 1]
    if (line === undefined) continue
    if (!hasCsharpAllocation(line.code)) continue
    into.push(
      createFinding(
        'per-frame-allocation',
        'per-frame-allocation',
        'warning',
        `'new' inside per-frame method '${name}' allocates every frame; cache the value in a field or reuse it`,
        number,
        fileName,
      ),
    )
  }
}

/**
 * Map each line inside a C# per-frame method body to that method's name.
 *
 * Brace depth decides the body: a `{` on a per-frame header line, or on a
 * line that follows one, opens the body, and the matching `}` closes it.
 *
 * @param lines - numbered lines with comments removed.
 * @returns line number to method name for every line inside a per-frame body.
 */
function collectCsharpPerFrameBodies(lines: readonly CodeLine[]): Map<number, string> {
  const bodies = new Map<number, string>()
  const stack: Array<string | null | undefined> = []
  let pending: string | null = null
  for (const line of lines) {
    const code = line.code
    if (code.trim() === '') continue
    const header = csharpPerFrameName(code)
    const scope = innermostPerFrameName(stack)
    if (scope !== undefined) bodies.set(line.number, scope)
    let opened = false
    for (const character of code) {
      if (character === '{') {
        stack.push(pending ?? header ?? innermostPerFrameName(stack))
        opened = true
        pending = null
      } else if (character === '}') {
        stack.pop()
        pending = null
      }
    }
    pending = opened ? null : header
  }
  return bodies
}

/**
 * Read the per-frame method name a line declares.
 *
 * @param code - one line with comments removed.
 * @returns the method name, or `null` when the line declares no per-frame method.
 */
function csharpPerFrameName(code: string): string | null {
  const match = CSHARP_PER_FRAME.exec(code)
  return match?.[1] ?? null
}

/**
 * Read the innermost per-frame method name still open.
 *
 * @param stack - one entry per open brace, holding the method name or `undefined`.
 * @returns the innermost method name, or `undefined` when no per-frame method is open.
 */
function innermostPerFrameName(stack: readonly (string | null | undefined)[]): string | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index]
    if (entry !== null && entry !== undefined) return entry
  }
  return undefined
}

/**
 * Decide whether a C# line contains a `new` allocation expression.
 *
 * A `new` that hides a base member is followed by a modifier keyword and is
 * not an allocation.
 *
 * @param code - one line with comments removed.
 * @returns `true` when the line contains a `new` allocation.
 */
function hasCsharpAllocation(code: string): boolean {
  for (const match of code.matchAll(CSHARP_NEW)) {
    const token = match[1]
    if (token === undefined) continue
    if (token === '(') return true
    if (!CSHARP_NEW_MODIFIERS.test(token)) return true
  }
  return false
}

/**
 * Report every `Time.timeScale` assignment to zero in one source.
 *
 * The assignment pauses the game and needs a matching restore to a non-zero
 * scale. The check reads only the assignment, so it cannot verify the
 * restore.
 *
 * @param lines - numbered lines with comments removed.
 * @param fileName - file name reported on each finding.
 * @param into - array the findings are appended to, in line order.
 */
function collectPauseFindings(
  lines: readonly CodeLine[],
  fileName: string,
  into: LifecycleFinding[],
): void {
  for (const line of lines) {
    if (!TIME_SCALE_PAUSE.test(line.code)) continue
    into.push(
      createFinding(
        'time-scale-pause',
        'pause-handling',
        'info',
        '`Time.timeScale = 0` pauses the game and needs a matching restore to a non-zero scale; this check cannot verify the restore',
        line.number,
        fileName,
      ),
    )
  }
}

/**
 * Report a C# Unity message method declared without its counterpart.
 *
 * `OnEnable` and `OnDisable` pair across an enable and disable cycle. The
 * check reads one source text, so a counterpart in another file is not seen.
 *
 * @param lines - numbered lines with comments removed.
 * @param fileName - file name reported on each finding.
 * @param into - array the findings are appended to, in line order.
 */
function collectUnityMessageFindings(
  lines: readonly CodeLine[],
  fileName: string,
  into: LifecycleFinding[],
): void {
  const onEnable: number[] = []
  const onDisable: number[] = []
  for (const line of lines) {
    const match = UNITY_MESSAGE.exec(line.code)
    if (match === null) continue
    if (match[1] === 'OnEnable') onEnable.push(line.number)
    else onDisable.push(line.number)
  }
  if (onDisable.length === 0) {
    for (const number of onEnable) {
      into.push(
        createFinding(
          'unpaired-unity-message',
          'unpaired-unity-message',
          'warning',
          "'OnEnable' is declared without a matching 'OnDisable' in this file",
          number,
          fileName,
        ),
      )
    }
  } else if (onEnable.length === 0) {
    for (const number of onDisable) {
      into.push(
        createFinding(
          'unpaired-unity-message',
          'unpaired-unity-message',
          'warning',
          "'OnDisable' is declared without a matching 'OnEnable' in this file",
          number,
          fileName,
        ),
      )
    }
  }
}

/**
 * Run every lifecycle check over the sites read from one source.
 *
 * @param lines - numbered lines with comments removed.
 * @param sites - subscription and unsubscription sites found in those lines.
 * @param language - language that decides which check identifiers the pairing check uses.
 * @param fileName - file name reported on each finding.
 * @returns the findings in emission order: subscription pairing, unpaired unsubscribe, duplicate, anonymous, loop subscription, then the C# async void, per-frame allocation, pause, and Unity message checks.
 */
function collectFindings(
  lines: readonly CodeLine[],
  sites: SubscriptionSites,
  language: ScriptLanguage,
  fileName: string,
): LifecycleFinding[] {
  const findings: LifecycleFinding[] = []
  const subscriptionsByKey = groupByKey(sites.subscriptions)
  const unsubscribesByKey = groupByKey(sites.unsubscribes)
  const pairingId = language === 'csharp' ? 'csharp-unpaired-subscription' : 'gdscript-unpaired-connect'
  const pairingHint = language === 'csharp' ? "'-=' unsubscribe" : "'disconnect' call"

  for (const [key, subscriptions] of subscriptionsByKey) {
    const unsubscriptions = unsubscribesByKey.get(key) ?? []
    for (let index = unsubscriptions.length; index < subscriptions.length; index += 1) {
      const subscription = subscriptions[index]
      if (subscription === undefined) continue
      findings.push(
        createFinding(
          pairingId,
          'subscription-pairing',
          'warning',
          `'${subscription.display}' has no matching ${pairingHint} in this file`,
          subscription.line,
          fileName,
        ),
      )
    }
  }

  for (const [key, unsubscriptions] of unsubscribesByKey) {
    const subscriptions = subscriptionsByKey.get(key) ?? []
    for (let index = subscriptions.length; index < unsubscriptions.length; index += 1) {
      const unsubscription = unsubscriptions[index]
      if (unsubscription === undefined) continue
      findings.push(
        createFinding(
          'unpaired-unsubscribe',
          'subscription-pairing',
          'warning',
          `'${unsubscription.display}' has no matching subscription in this file`,
          unsubscription.line,
          fileName,
        ),
      )
    }
  }

  for (const subscriptions of subscriptionsByKey.values()) {
    if (subscriptions.length < 2) continue
    const first = subscriptions[0]
    if (first === undefined) continue
    for (let index = 1; index < subscriptions.length; index += 1) {
      const repeated = subscriptions[index]
      if (repeated === undefined) continue
      findings.push(
        createFinding(
          'duplicate-subscription',
          'duplicate-subscription',
          'error',
          `'${repeated.display}' subscribes the same handler a second time; the first subscription is on line ${first.line}`,
          repeated.line,
          fileName,
        ),
      )
    }
  }

  for (const subscription of sites.subscriptions) {
    if (!subscription.anonymous) continue
    findings.push(
      createFinding(
        'anonymous-subscription',
        'anonymous-subscription',
        'warning',
        `'${subscription.display}' is anonymous; keep a reference to the delegate or callable so teardown can unsubscribe it`,
        subscription.line,
        fileName,
      ),
    )
  }

  const loopScopes =
    language === 'csharp' ? collectCsharpLoopScopes(lines) : collectGdscriptLoopScopes(lines)
  for (const subscription of sites.subscriptions) {
    const header = loopScopes.get(subscription.line)
    if (header === undefined) continue
    if (identifiersOverlap(header, subscription.receiver)) continue
    findings.push(
      createFinding(
        'loop-subscription',
        'loop-subscription',
        'warning',
        `'${subscription.display}' subscribes inside a loop body, so the subscription repeats on every iteration`,
        subscription.line,
        fileName,
      ),
    )
  }

  if (language === 'csharp') {
    collectAsyncVoidFindings(lines, fileName, findings)
    collectPerFrameAllocations(lines, fileName, findings)
    collectPauseFindings(lines, fileName, findings)
    collectUnityMessageFindings(lines, fileName, findings)
  }

  return findings
}

/**
 * Order findings by line number, then by check identifier.
 *
 * @param left - first finding.
 * @param right - second finding.
 * @returns a negative number, zero, or a positive number as `left` sorts before, with, or after `right`.
 */
function compareFindings(left: LifecycleFinding, right: LifecycleFinding): number {
  if (left.line !== right.line) return left.line - right.line
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}
