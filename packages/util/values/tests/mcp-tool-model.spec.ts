import { describe, expect, it } from 'vitest'
import { formatMcpToolCatalog, isValidMcpTool, mcpToolNames, validateMcpTool } from '../src/mcp-tool-model.ts'

describe('validateMcpTool', () => {
  const valid = { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' as const, properties: { path: { type: 'string' } }, required: ['path'] } }

  it('accepts a valid descriptor', () => {
    expect(validateMcpTool(valid)).toEqual([])
    expect(isValidMcpTool(valid)).toBe(true)
  })

  it('rejects an empty name', () => {
    expect(validateMcpTool({ ...valid, name: '' })).toContain('name must be a non-empty identifier without whitespace')
  })

  it('rejects a name with whitespace', () => {
    expect(validateMcpTool({ ...valid, name: 'read file' })).toContain('name must be a non-empty identifier without whitespace')
  })

  it('rejects an empty description', () => {
    expect(validateMcpTool({ ...valid, description: '   ' })).toContain('description must not be empty')
  })

  it('rejects a schema with no properties', () => {
    expect(validateMcpTool({ ...valid, inputSchema: { type: 'object' as const, properties: {} } })).toContain('inputSchema declares no properties')
  })

  it('rejects a required entry not in properties', () => {
    expect(validateMcpTool({ ...valid, inputSchema: { type: 'object' as const, properties: { path: { type: 'string' } }, required: ['missing'] } })).toContain('required property "missing" is not declared in properties')
  })

  it('rejects a duplicate required entry', () => {
    expect(validateMcpTool({ ...valid, inputSchema: { type: 'object' as const, properties: { path: { type: 'string' } }, required: ['path', 'path'] } })).toContain('required property "path" is listed more than once')
  })

  it('accepts a schema without required', () => {
    expect(validateMcpTool({ name: 'x', description: 'd', inputSchema: { type: 'object' as const, properties: { a: { type: 'string' } } } })).toEqual([])
  })
})

describe('formatMcpToolCatalog', () => {
  it('returns empty string for no descriptors', () => {
    expect(formatMcpToolCatalog([])).toBe('')
  })

  it('sorts by name and renders name: description', () => {
    const a = { name: 'z', description: 'last', inputSchema: { type: 'object' as const, properties: { x: { type: 'string' } } } }
    const b = { name: 'a', description: 'first', inputSchema: { type: 'object' as const, properties: { x: { type: 'string' } } } }
    expect(formatMcpToolCatalog([a, b])).toBe('a: first\nz: last')
  })
})

describe('mcpToolNames', () => {
  it('preserves input order', () => {
    const d = { name: 'n', description: 'd', inputSchema: { type: 'object' as const, properties: { x: { type: 'string' } } } }
    expect(mcpToolNames([d, { ...d, name: 'm' }])).toEqual(['n', 'm'])
  })
})
