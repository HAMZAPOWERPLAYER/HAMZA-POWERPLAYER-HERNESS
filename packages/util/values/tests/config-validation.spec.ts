import { describe, expect, it } from 'vitest'
import {
  getOptionalString,
  requireBoolean,
  requireNumber,
  requireString,
  validateKeys,
  type ConfigObject,
} from '../src/config-validation.ts'

describe('requireString', () => {
  it('returns the string when present and non-empty', () => {
    const config: ConfigObject = { name: 'abc' }
    expect(requireString(config, 'name')).toBe('abc')
  })
  it('throws when missing', () => {
    expect(() => requireString({}, 'name')).toThrow()
  })
  it('throws when not a string', () => {
    expect(() => requireString({ name: 1 }, 'name')).toThrow()
  })
  it('throws when empty', () => {
    expect(() => requireString({ name: '' }, 'name')).toThrow()
  })
  it('throws with the expected message', () => {
    expect(() => requireString({}, 'name')).toThrow(/name must be a non-empty string/)
  })
})

describe('requireNumber', () => {
  it('returns the number when present', () => {
    const config: ConfigObject = { count: 5 }
    expect(requireNumber(config, 'count')).toBe(5)
  })
  it('throws when missing', () => {
    expect(() => requireNumber({}, 'count')).toThrow()
  })
  it('throws when not a number', () => {
    expect(() => requireNumber({ count: '5' }, 'count')).toThrow()
  })
  it('throws when NaN', () => {
    expect(() => requireNumber({ count: Number.NaN }, 'count')).toThrow()
  })
  it('enforces min', () => {
    expect(requireNumber({ count: 5 }, 'count', { min: 3 })).toBe(5)
    expect(() => requireNumber({ count: 1 }, 'count', { min: 3 })).toThrow()
  })
  it('enforces max', () => {
    expect(requireNumber({ count: 5 }, 'count', { max: 10 })).toBe(5)
    expect(() => requireNumber({ count: 11 }, 'count', { max: 10 })).toThrow()
  })
})

describe('requireBoolean', () => {
  it('returns the boolean when present', () => {
    const config: ConfigObject = { flag: true }
    expect(requireBoolean(config, 'flag')).toBe(true)
  })
  it('throws when missing', () => {
    expect(() => requireBoolean({}, 'flag')).toThrow()
  })
  it('throws when not a boolean', () => {
    expect(() => requireBoolean({ flag: 1 }, 'flag')).toThrow()
  })
})

describe('getOptionalString', () => {
  it('returns undefined when missing', () => {
    expect(getOptionalString({}, 'name')).toBeUndefined()
  })
  it('returns the string when present', () => {
    const config: ConfigObject = { name: 'abc' }
    expect(getOptionalString(config, 'name')).toBe('abc')
  })
  it('returns undefined when not a string', () => {
    expect(getOptionalString({ name: 1 }, 'name')).toBeUndefined()
  })
})

describe('validateKeys', () => {
  it('does not throw for allowed keys', () => {
    const config: ConfigObject = { a: 1, b: 'x' }
    expect(() => validateKeys(config, ['a', 'b'])).not.toThrow()
  })
  it('throws listing unknown keys', () => {
    const config: ConfigObject = { a: 1, c: 2 }
    expect(() => validateKeys(config, ['a', 'b'])).toThrow(/Unknown config keys: c/)
  })
})
