import { describe, expect, it } from 'vitest'
import {
  assertIdentifier,
  IDENTIFIER_PATTERN,
  isValidIdentifier,
  makeIdentifier,
  normalizeIdentifier,
} from '../src/identifier.ts'

describe('IDENTIFIER_PATTERN', () => {
  it('matches kebab-case identifiers', () => {
    expect('foo').toMatch(IDENTIFIER_PATTERN)
    expect('foo-bar').toMatch(IDENTIFIER_PATTERN)
    expect('a1-b2-c3').toMatch(IDENTIFIER_PATTERN)
  })
  it('rejects uppercase, doubled hyphens, and edge hyphens', () => {
    expect(IDENTIFIER_PATTERN.test('Foo')).toBe(false)
    expect(IDENTIFIER_PATTERN.test('foo--bar')).toBe(false)
    expect(IDENTIFIER_PATTERN.test('-foo')).toBe(false)
    expect(IDENTIFIER_PATTERN.test('foo-')).toBe(false)
  })
})

describe('isValidIdentifier', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    expect(isValidIdentifier('foo')).toBe(true)
    expect(isValidIdentifier('foo-bar')).toBe(true)
    expect(isValidIdentifier('foo-bar-baz')).toBe(true)
  })
  it('accepts digits', () => {
    expect(isValidIdentifier('123')).toBe(true)
    expect(isValidIdentifier('v1-2-3')).toBe(true)
  })
  it('rejects the empty string', () => {
    expect(isValidIdentifier('')).toBe(false)
  })
  it('rejects uppercase letters', () => {
    expect(isValidIdentifier('Foo')).toBe(false)
    expect(isValidIdentifier('fooBar')).toBe(false)
    expect(isValidIdentifier('FOO')).toBe(false)
  })
  it('rejects doubled hyphens', () => {
    expect(isValidIdentifier('foo--bar')).toBe(false)
  })
  it('rejects leading and trailing hyphens', () => {
    expect(isValidIdentifier('-foo')).toBe(false)
    expect(isValidIdentifier('foo-')).toBe(false)
    expect(isValidIdentifier('-')).toBe(false)
  })
  it('rejects spaces, underscores, and other separators', () => {
    expect(isValidIdentifier('foo bar')).toBe(false)
    expect(isValidIdentifier('foo_bar')).toBe(false)
    expect(isValidIdentifier('foo.bar')).toBe(false)
    expect(isValidIdentifier(' foo')).toBe(false)
    expect(isValidIdentifier('foo ')).toBe(false)
  })
})

describe('normalizeIdentifier', () => {
  it('lowercases and joins words split by spaces', () => {
    expect(normalizeIdentifier('Hello World')).toBe('hello-world')
    expect(normalizeIdentifier('Foo   Bar')).toBe('foo-bar')
  })
  it('trims outer whitespace', () => {
    expect(normalizeIdentifier('  Trim Me  ')).toBe('trim-me')
  })
  it('collapses underscores and repeated separators', () => {
    expect(normalizeIdentifier('foo_bar')).toBe('foo-bar')
    expect(normalizeIdentifier('foo--bar')).toBe('foo-bar')
    expect(normalizeIdentifier('foo.bar/baz')).toBe('foo-bar-baz')
  })
  it('strips leading and trailing separators', () => {
    expect(normalizeIdentifier('--foo--')).toBe('foo')
    expect(normalizeIdentifier('___foo___')).toBe('foo')
  })
  it('treats non-Latin and accented letters as separators', () => {
    expect(normalizeIdentifier('Café ★ Münster')).toBe('caf-m-nster')
    expect(normalizeIdentifier('日本語')).toBe('')
  })
  it('leaves an already-normalized identifier unchanged', () => {
    expect(normalizeIdentifier('already-kebab')).toBe('already-kebab')
  })
  it('reduces text without alphanumeric characters to the empty string', () => {
    expect(normalizeIdentifier('')).toBe('')
    expect(normalizeIdentifier('   ')).toBe('')
    expect(normalizeIdentifier('___')).toBe('')
  })
  it('keeps digits from mixed text', () => {
    expect(normalizeIdentifier('v1.2.3')).toBe('v1-2-3')
    expect(normalizeIdentifier('-42')).toBe('42')
  })
})

describe('makeIdentifier', () => {
  it('normalizes each part and joins with hyphens', () => {
    expect(makeIdentifier(['Hello', 'World'])).toBe('hello-world')
    expect(makeIdentifier([' User ', 'Profile  Name'])).toBe('user-profile-name')
  })
  it('drops parts that normalize to nothing', () => {
    expect(makeIdentifier(['', '  ', 'Foo'])).toBe('foo')
    expect(makeIdentifier(['___', '---', 'bar'])).toBe('bar')
  })
  it('collapses separators across part boundaries', () => {
    expect(makeIdentifier(['a--b', 'c_d'])).toBe('a-b-c-d')
  })
  it('returns the empty string when nothing remains', () => {
    expect(makeIdentifier([])).toBe('')
    expect(makeIdentifier(['', '---'])).toBe('')
  })
})

describe('assertIdentifier', () => {
  it('returns the value when it is valid', () => {
    expect(assertIdentifier('foo-bar')).toBe('foo-bar')
  })
  it('throws with the default name when invalid', () => {
    expect(() => assertIdentifier('Foo')).toThrow('identifier must be a kebab-case identifier')
    expect(() => assertIdentifier('')).toThrow('identifier must be a kebab-case identifier')
  })
  it('throws with the supplied name when invalid', () => {
    expect(() => assertIdentifier('foo--bar', 'session id')).toThrow(
      'session id must be a kebab-case identifier',
    )
  })
})
