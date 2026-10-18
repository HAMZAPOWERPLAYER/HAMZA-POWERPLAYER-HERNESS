/**
 * Validated argv plans for subprocess execution.
 *
 * A plan reaches a non-shell subprocess as an argv array, so no argument
 * content is interpreted: quoting exists only in {@link describeCommandPlan}
 * for display. The executable is a bare tool name with no path separator;
 * callers resolve a tool to its path themselves.
 *
 * @module @deepseek-ai/dsh-util-values/command-plan
 */

/** Characters outside `[A-Za-z0-9._/@:=+,-]`, which force display quoting. */
const DISPLAY_UNSAFE = /[^A-Za-z0-9._/@:=+,-]/

/** Characters rejected by {@link isSafeExecutableName}. */
const SHELL_UNSAFE = /[\/\\&|;<>^%"'$`()\s]/

/** A validated plan for one subprocess execution. */
export interface CommandPlan {
  /** Bare executable name, without a path separator or NUL. */
  readonly executable: string
  /** Arguments in execution order, without NUL characters. */
  readonly args: readonly string[]
  /** Working directory; absent when the caller passed none. */
  readonly cwd?: string
}

/**
 * Render one argument for display: double-quoted when empty or when it holds a
 * character outside `[A-Za-z0-9._/@:=+,-]`, with `\` and `"` backslash-escaped
 * inside the quotes.
 *
 * @param argument - argument to render.
 * @returns the argument as it appears in a described plan.
 */
function quoteArgument(argument: string): string {
  if (argument === '') return '""'
  if (!DISPLAY_UNSAFE.test(argument)) return argument
  return `"${argument.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Validate and build a plan.
 *
 * @param executable - bare executable name; a path separator or NUL is rejected.
 * @param args - arguments in execution order; copied into the returned plan.
 * @param cwd - optional working directory.
 * @returns a plan whose `cwd` key is absent unless `cwd` was provided.
 * @throws Error `executable must not be empty` when `executable` is empty or whitespace-only.
 * @throws Error `executable must not contain NUL` when `executable` contains a NUL character.
 * @throws Error `executable must not contain a path separator` when `executable` contains `/` or `\`.
 * @throws Error `argument must not contain NUL` when any argument contains a NUL character.
 * @throws Error `cwd must not be empty` when `cwd` is provided but empty or whitespace-only.
 * @throws Error `cwd must not contain NUL` when `cwd` contains a NUL character.
 */
export function createCommandPlan(
  executable: string,
  args: readonly string[] = [],
  cwd?: string,
): CommandPlan {
  if (executable.trim() === '') throw new Error('executable must not be empty')
  if (executable.includes('\0')) throw new Error('executable must not contain NUL')
  if (executable.includes('/') || executable.includes('\\')) {
    throw new Error('executable must not contain a path separator')
  }
  for (const argument of args) {
    if (argument.includes('\0')) throw new Error('argument must not contain NUL')
  }
  if (cwd !== undefined) {
    if (cwd.trim() === '') throw new Error('cwd must not be empty')
    if (cwd.includes('\0')) throw new Error('cwd must not contain NUL')
  }
  const plan = { executable, args: [...args] }
  return cwd === undefined ? plan : { ...plan, cwd }
}

/**
 * Render a plan as a display string: `cwd=<cwd> ` when the plan has a working
 * directory, then the executable and its quoted arguments joined by single
 * spaces. The executable is emitted verbatim; only arguments are quoted, and
 * nothing here is re-parsed before execution.
 *
 * @param plan - plan to render.
 * @returns the display form of the plan.
 */
export function describeCommandPlan(plan: CommandPlan): string {
  const command = [plan.executable, ...plan.args.map(quoteArgument)].join(' ')
  return plan.cwd === undefined ? command : `cwd=${plan.cwd} ${command}`
}

/**
 * Whether a name can be used as a shell word without interpretation. This is
 * defense in depth for callers that might route a command through a shell; argv
 * execution does not require it.
 *
 * @param name - candidate executable name.
 * @returns `true` when the name is non-empty and contains no path separator,
 * shell metacharacter, quote, `$`, backtick, parenthesis, or whitespace.
 */
export function isSafeExecutableName(name: string): boolean {
  return name !== '' && !SHELL_UNSAFE.test(name)
}

/**
 * Select arguments by position, preserving the requested order and allowing
 * repeats.
 *
 * @param plan - plan to read from.
 * @param indices - zero-based positions, each an integer in `[0, plan.args.length)`.
 * @returns the selected arguments in the requested order.
 * @throws Error `argument index out of range: <i>` when an index is negative,
 * fractional, or at least `plan.args.length`.
 */
export function selectedArguments(plan: CommandPlan, indices: readonly number[]): readonly string[] {
  const selected: string[] = []
  for (const index of indices) {
    const argument = plan.args[index]
    if (argument === undefined) throw new Error(`argument index out of range: ${index}`)
    selected.push(argument)
  }
  return selected
}
