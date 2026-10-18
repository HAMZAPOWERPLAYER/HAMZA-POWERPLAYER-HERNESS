import { describe, expect, it } from 'vitest'
import {
  formatToolCatalog,
  isValidToolDefinition,
  toolIds,
  validateToolDefinition,
  type ToolDefinition,
} from '../src/tool-registry-model.ts'

/** Build a valid definition, overriding only the fields a test cares about. */
function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: 'read-file',
    description: 'Read a file from disk.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File to read.' } },
      required: ['path'],
    },
    risk: 'low',
    ...overrides,
  }
}

describe('validateToolDefinition', () => {
  it('returns no problems for a valid definition', () => {
    expect(validateToolDefinition(tool())).toEqual([])
  })
  it('accepts kebab-case ids with digits', () => {
    expect(validateToolDefinition(tool({ id: 'tool-2' }))).toEqual([])
  })
  it('reports an id that is not kebab-case', () => {
    expect(validateToolDefinition(tool({ id: 'ReadFile' }))).toEqual(['id "ReadFile" is not kebab-case'])
    expect(validateToolDefinition(tool({ id: 'read_file' }))).toEqual(['id "read_file" is not kebab-case'])
    expect(validateToolDefinition(tool({ id: 'read--file' }))).toEqual(['id "read--file" is not kebab-case'])
    expect(validateToolDefinition(tool({ id: '' }))).toEqual(['id "" is not kebab-case'])
  })
  it('reports an empty description', () => {
    expect(validateToolDefinition(tool({ description: '' }))).toEqual(['description is empty'])
  })
  it('reports a schema without properties', () => {
    expect(validateToolDefinition(tool({ inputSchema: { type: 'object', properties: {} } }))).toEqual([
      'inputSchema declares no properties',
    ])
  })
  it('reports a required entry missing from properties', () => {
    const definition = tool({
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path', 'limit'],
      },
    })
    expect(validateToolDefinition(definition)).toEqual(['required entry "limit" is not declared in properties'])
  })
  it('reports a duplicated required entry once', () => {
    const definition = tool({
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path', 'path', 'path'],
      },
    })
    expect(validateToolDefinition(definition)).toEqual(['required entry "path" is listed more than once'])
  })
  it('reports every problem in check order', () => {
    const definition: ToolDefinition = {
      id: 'Bad Id',
      description: '',
      inputSchema: { type: 'object', properties: {}, required: ['limit', 'limit'] },
      risk: 'critical',
    }
    expect(validateToolDefinition(definition)).toEqual([
      'id "Bad Id" is not kebab-case',
      'description is empty',
      'inputSchema declares no properties',
      'required entry "limit" is not declared in properties',
      'required entry "limit" is listed more than once',
    ])
  })
  it('accepts a schema without required entries', () => {
    expect(validateToolDefinition(tool({ inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }))).toEqual([])
  })
})

describe('isValidToolDefinition', () => {
  it('is true for a valid definition', () => {
    expect(isValidToolDefinition(tool())).toBe(true)
  })
  it('is false when any problem exists', () => {
    expect(isValidToolDefinition(tool({ id: 'Nope' }))).toBe(false)
    expect(isValidToolDefinition(tool({ description: '' }))).toBe(false)
    expect(isValidToolDefinition(tool({ inputSchema: { type: 'object', properties: {} } }))).toBe(false)
  })
})

describe('formatToolCatalog', () => {
  it('returns an empty string for no definitions', () => {
    expect(formatToolCatalog([])).toBe('')
  })
  it('renders one line per tool', () => {
    expect(formatToolCatalog([tool()])).toBe('read-file [low]: Read a file from disk.')
  })
  it('sorts by id regardless of input order', () => {
    const zeta = tool({ id: 'zeta-tool', description: 'Zeta tool.', risk: 'critical' })
    const alpha = tool({ id: 'alpha', description: 'Alpha tool.', risk: 'medium' })
    const mid = tool({ id: 'mid', description: 'Mid tool.', risk: 'high' })
    expect(formatToolCatalog([zeta, mid, alpha])).toBe(
      'alpha [medium]: Alpha tool.\nmid [high]: Mid tool.\nzeta-tool [critical]: Zeta tool.',
    )
  })
  it('does not mutate its argument', () => {
    const zeta = tool({ id: 'zeta-tool' })
    const alpha = tool({ id: 'alpha' })
    const defs: readonly ToolDefinition[] = [zeta, alpha]
    formatToolCatalog(defs)
    expect(toolIds(defs)).toEqual(['zeta-tool', 'alpha'])
  })
})

describe('toolIds', () => {
  it('returns identifiers in declaration order', () => {
    expect(toolIds([tool({ id: 'zeta-tool' }), tool({ id: 'alpha' })])).toEqual(['zeta-tool', 'alpha'])
  })
  it('returns an empty list for no definitions', () => {
    expect(toolIds([])).toEqual([])
  })
})
