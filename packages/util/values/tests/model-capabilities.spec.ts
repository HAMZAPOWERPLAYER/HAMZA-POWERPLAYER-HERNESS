import { describe, expect, it } from 'vitest'
import {
  capabilityCount,
  missingCapabilities,
  supports,
  supportsAll,
  supportsAny,
  type ModelCapabilities,
} from '../src/index.ts'

const caps: ModelCapabilities = { supported: ['text', 'streaming', 'tool-calling'] }

describe('model capabilities', () => {
  it('supports a declared capability', () => {
    expect(supports(caps, 'text')).toBe(true)
    expect(supports(caps, 'vision')).toBe(false)
  })
  it('supportsAll requires every capability', () => {
    expect(supportsAll(caps, ['text', 'streaming'])).toBe(true)
    expect(supportsAll(caps, ['text', 'vision'])).toBe(false)
    expect(supportsAll(caps, [])).toBe(true)
  })
  it('supportsAny requires one capability', () => {
    expect(supportsAny(caps, ['vision', 'streaming'])).toBe(true)
    expect(supportsAny(caps, ['vision', 'cancellation'])).toBe(false)
    expect(supportsAny(caps, [])).toBe(false)
  })
  it('counts declared capabilities', () => {
    expect(capabilityCount(caps)).toBe(3)
  })
  it('lists missing capabilities in order', () => {
    expect(missingCapabilities(caps, ['vision', 'text', 'structured-output'])).toEqual([
      'vision',
      'structured-output',
    ])
  })
})
