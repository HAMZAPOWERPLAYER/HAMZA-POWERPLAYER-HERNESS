/**
 * Assemble a system prompt from ordered sections under a token budget.
 *
 * Sections are selected greedily by priority while a fixed separator cost is
 * accounted between included sections; low-priority sections are dropped when
 * the budget is tight. The helpers are pure, stateless, perform no I/O, and
 * import only local value primitives.
 *
 * @module @deepseek-ai/dsh-util-values/agent-prompt-model
 */

import { estimateTokens } from './token-estimate.ts'

/** Fixed separator cost, in estimated tokens, between two included sections. */
const SECTION_SEPARATOR_TOKENS = 4

/** One candidate section of a prompt. */
export interface PromptSection {
  /** Stable name of the section. */
  readonly name: string
  /** Text content of the section. */
  readonly content: string
  /** Selection priority; higher values are preferred. */
  readonly priority: number
}

/** Result of assembling a prompt under a token budget. */
export interface PromptAssembly {
  /** Included sections, in included order. */
  readonly sections: readonly PromptSection[]
  /** Names of dropped sections, lowest priority first. */
  readonly dropped: readonly string[]
  /** Estimated tokens of the included sections plus separators. */
  readonly estimatedTokens: number
  /** Whether every input section was included. */
  readonly withinBudget: boolean
}

/**
 * Assemble a prompt from `sections` under `budgetTokens`.
 *
 * Sections are sorted by priority descending (stable: equal priority keeps
 * input order). Sections are then included greedily in that order while the
 * cumulative estimate — each section's {@link estimateTokens} count plus a
 * fixed {@link SECTION_SEPARATOR_TOKENS}-token separator between included
 * sections — stays within `budgetTokens`. Sections that do not fit are
 * dropped; their names are recorded in `dropped` in priority-ascending order
 * (lowest priority first, input order for ties).
 *
 * @param sections - candidate sections, in any input order.
 * @param budgetTokens - maximum estimated tokens to spend, inclusive.
 * @returns the assembly describing included and dropped sections.
 * @throws {Error} when `budgetTokens` is negative.
 */
export function assemblePrompt(
  sections: readonly PromptSection[],
  budgetTokens: number,
): PromptAssembly {
  if (budgetTokens < 0) {
    throw new Error('budgetTokens must be non-negative')
  }

  const count = sections.length
  const priorityAt = (index: number): number => sections[index]?.priority ?? 0
  const nameAt = (index: number): string => sections[index]?.name ?? ''
  // Stable descending priority order, ties broken by input index.
  const descending: number[] = []
  for (let index = 0; index < count; index++) descending.push(index)
  descending.sort((a, b) => {
    const priorityDelta = priorityAt(b) - priorityAt(a)
    if (priorityDelta !== 0) return priorityDelta
    return a - b
  })

  const includedIndices: number[] = []
  const includedSet = new Set<number>()
  let cumulative = 0
  for (const index of descending) {
    const entry = sections[index]
    if (entry === undefined) continue
    const estimate = estimateTokens(entry.content).tokens
    const separator = includedIndices.length === 0 ? 0 : SECTION_SEPARATOR_TOKENS
    const nextTotal = cumulative + separator + estimate
    if (nextTotal <= budgetTokens) {
      includedIndices.push(index)
      includedSet.add(index)
      cumulative = nextTotal
    }
  }

  // Dropped in priority-ascending order (lowest first), input order for ties.
  const droppedIndices: number[] = []
  for (let index = 0; index < count; index++) {
    if (!includedSet.has(index)) droppedIndices.push(index)
  }
  droppedIndices.sort((a, b) => {
    const priorityDelta = priorityAt(a) - priorityAt(b)
    if (priorityDelta !== 0) return priorityDelta
    return a - b
  })
  const dropped = droppedIndices.map((index) => nameAt(index))

  // Included sections in selection order (priority descending).
  const includedSections = includedIndices
    .slice()
    .sort((a, b) => {
      const priorityDelta = priorityAt(b) - priorityAt(a)
      if (priorityDelta !== 0) return priorityDelta
      return a - b
    })
    .map((index) => sections[index])
    .filter((entry): entry is PromptSection => entry !== undefined)

  return {
    sections: includedSections,
    dropped,
    estimatedTokens: cumulative,
    withinBudget: includedSet.size === count,
  }
}

/**
 * Render an assembly as prompt text.
 *
 * Included sections are joined with `'\n\n'` in included order. An empty
 * assembly (or one with no included sections) renders as `''`.
 *
 * @param assembly - assembly to render.
 * @returns the joined prompt text.
 */
export function formatPrompt(assembly: PromptAssembly): string {
  return assembly.sections.map((section) => section.content).join('\n\n')
}

/**
 * Names of the included sections, in included order.
 *
 * @param assembly - assembly to inspect.
 * @returns the included section names.
 */
export function promptSectionNames(assembly: PromptAssembly): readonly string[] {
  return assembly.sections.map((section) => section.name)
}
