/**
 * Pure validation and rendering helpers for Model Context Protocol tool
 * descriptors. This module owns only the shape checks and the deterministic
 * catalog text; it performs no I/O, holds no state, and does not register
 * anything with a tool registry or a transport.
 *
 * @module @deepseek-ai/dsh-util-values/mcp-tool-model
 */

/** An MCP tool descriptor as the harness consumes it. */
export interface McpToolDescriptor {
  readonly name: string
  readonly description: string
  readonly inputSchema: {
    readonly type: 'object'
    readonly properties: Readonly<Record<string, { readonly type: string; readonly description?: string }>>
    readonly required?: readonly string[]
  }
}

/** Problems found in one MCP tool descriptor. */
/** Problems found in one MCP tool descriptor.
 * @param descriptor - descriptor to validate.
 * @returns problem strings.
 */
export function validateMcpTool(descriptor: McpToolDescriptor): readonly string[] {
  const problems: string[] = []
  if (descriptor.name === '' || /\s/.test(descriptor.name)) {
    problems.push('name must be a non-empty identifier without whitespace')
  }
  if (descriptor.description.trim() === '') {
    problems.push('description must not be empty')
  }
  if (Object.keys(descriptor.inputSchema.properties).length === 0) {
    problems.push('inputSchema declares no properties')
  }
  const required = descriptor.inputSchema.required ?? []
  const seen = new Set<string>()
  for (const entry of required) {
    if (!Object.prototype.hasOwnProperty.call(descriptor.inputSchema.properties, entry)) {
      problems.push(`required property "${entry}" is not declared in properties`)
    }
    if (seen.has(entry)) problems.push(`required property "${entry}" is listed more than once`)
    seen.add(entry)
  }
  return problems
}

/** Whether an MCP tool descriptor is valid. */
/** Whether an MCP tool descriptor is valid.
 * @param descriptor - descriptor to validate.
 * @returns whether it is valid.
 */
export function isValidMcpTool(descriptor: McpToolDescriptor): boolean {
  return validateMcpTool(descriptor).length === 0
}

/** Render a deterministic MCP tool catalog, sorted by name. */
/** Render a deterministic MCP tool catalog, sorted by name.
 * @param descriptors - descriptors to render.
 * @returns the catalog text.
 */
export function formatMcpToolCatalog(descriptors: readonly McpToolDescriptor[]): string {
  if (descriptors.length === 0) return ''
  const sorted = [...descriptors].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return sorted.map((descriptor) => `${descriptor.name}: ${descriptor.description}`).join('\n')
}

/** Collect the names of the supplied descriptors, in input order. */
/** Collect the names of the supplied descriptors, in input order.
 * @param descriptors - descriptors to name.
 * @returns the names in input order.
 */
export function mcpToolNames(descriptors: readonly McpToolDescriptor[]): readonly string[] {
  return descriptors.map((descriptor) => descriptor.name)
}
