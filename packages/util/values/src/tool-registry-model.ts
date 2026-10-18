/**
 * Pure descriptions of tool definitions for validation and reporting.
 *
 * A {@link ToolDefinition} states a tool's identifier, model-facing
 * description, input schema subset, and risk class. These helpers validate such
 * descriptions and render deterministic catalogs; they never register a tool
 * with a runtime and perform no I/O. Every function is deterministic and holds
 * no state.
 *
 * @module @deepseek-ai/dsh-util-values/tool-registry-model
 */

/** The JSON Schema subset a tool definition declares for its input. */
export interface JsonSchemaSubset {
  /** Always an object schema; inputs are named properties. */
  readonly type: 'object'
  /** Declared input properties keyed by property name. */
  readonly properties: Readonly<Record<string, { readonly type: string; readonly description?: string }>>
  /** Names of the properties a caller must provide. */
  readonly required?: readonly string[]
}

/** One declared tool definition: identity, description, input schema, and risk. */
export interface ToolDefinition {
  /** Kebab-case tool identifier. */
  readonly id: string
  /** Model-facing description of what the tool does. */
  readonly description: string
  /** Input schema the tool accepts. */
  readonly inputSchema: JsonSchemaSubset
  /** Consequence class used for approval and reporting decisions. */
  readonly risk: 'low' | 'medium' | 'high' | 'critical'
}

/** Kebab-case identifier: lowercase alphanumeric segments joined by single hyphens. */
const KEBAB_CASE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Collect every problem found in a tool definition.
 *
 * Checks run in a fixed order: identifier shape, description text, declared
 * properties, then required entries in declaration order. An empty result means
 * the definition is valid.
 *
 * @param def - tool definition to validate.
 * @returns one description per problem, ordered by the check that found it.
 */
export function validateToolDefinition(def: ToolDefinition): readonly string[] {
  const problems: string[] = []
  if (!KEBAB_CASE_ID.test(def.id)) problems.push(`id "${def.id}" is not kebab-case`)
  if (def.description === '') problems.push('description is empty')

  const declared = new Set(Object.keys(def.inputSchema.properties))
  if (declared.size === 0) problems.push('inputSchema declares no properties')

  const seen = new Set<string>()
  const reportedDuplicates = new Set<string>()
  for (const name of def.inputSchema.required ?? []) {
    if (seen.has(name)) {
      if (!reportedDuplicates.has(name)) {
        problems.push(`required entry "${name}" is listed more than once`)
        reportedDuplicates.add(name)
      }
      continue
    }
    seen.add(name)
    if (!declared.has(name)) {
      problems.push(`required entry "${name}" is not declared in properties`)
    }
  }
  return problems
}

/**
 * Whether a tool definition passes every {@link validateToolDefinition} check.
 * @param def - tool definition to test.
 * @returns `true` when validation reports no problems.
 */
export function isValidToolDefinition(def: ToolDefinition): boolean {
  return validateToolDefinition(def).length === 0
}

/**
 * Render a deterministic one-line-per-tool catalog, sorted by tool id.
 * @param defs - tool definitions to render.
 * @returns lines of the form `${id} [${risk}]: ${description}`, or `''` when `defs` is empty.
 */
export function formatToolCatalog(defs: readonly ToolDefinition[]): string {
  return [...defs]
    .sort(compareById)
    .map((def) => `${def.id} [${def.risk}]: ${def.description}`)
    .join('\n')
}

/**
 * List the identifiers of `defs` in declaration order.
 * @param defs - tool definitions to read.
 * @returns each definition's `id`, in the order given.
 */
export function toolIds(defs: readonly ToolDefinition[]): readonly string[] {
  return defs.map((def) => def.id)
}

/**
 * Order tool definitions by identifier using code-unit comparison, independent
 * of the host locale.
 * @param a - first definition.
 * @param b - second definition.
 * @returns a negative number when `a` sorts first, positive when `b` does, and zero when equal.
 */
function compareById(a: ToolDefinition, b: ToolDefinition): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}
