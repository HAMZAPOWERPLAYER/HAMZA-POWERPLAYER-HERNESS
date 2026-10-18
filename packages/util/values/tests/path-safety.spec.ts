import { describe, expect, it } from 'vitest'
import {
  isPathWithinRoot,
  normalizePath,
  normalizePathSegments,
  resolveContainedPath,
} from '../src/index.ts'

describe('normalizePathSegments', () => {
  it('drops empty and dot segments', () => {
    expect(normalizePathSegments('a/./b')).toEqual(['a', 'b'])
  })
  it('resolves ..', () => {
    expect(normalizePathSegments('a/b/../c')).toEqual(['a', 'c'])
  })
  it('normalizes backslashes', () => {
    expect(normalizePathSegments('a\\b')).toEqual(['a', 'b'])
  })
})

describe('normalizePath', () => {
  it('joins segments', () => {
    expect(normalizePath('a/b/../c')).toBe('a/c')
  })
  it('preserves leading slash for absolute', () => {
    expect(normalizePath('/a/b')).toBe('/a/b')
  })
})

describe('isPathWithinRoot', () => {
  it('true for child', () => {
    expect(isPathWithinRoot('/root', '/root/sub/file')).toBe(true)
  })
  it('true for root itself', () => {
    expect(isPathWithinRoot('/root', '/root')).toBe(true)
  })
  it('false for sibling', () => {
    expect(isPathWithinRoot('/root', '/other')).toBe(false)
  })
  it('false for traversal escape', () => {
    expect(isPathWithinRoot('/root', '/root/../etc')).toBe(false)
  })
})

describe('resolveContainedPath', () => {
  it('resolves relative inside root', () => {
    expect(resolveContainedPath('/root', 'sub/file')).toBe('root/sub/file')
  })
  it('returns null on traversal escape', () => {
    expect(resolveContainedPath('/root', '../etc')).toBeNull()
  })
  it('handles absolute inside root', () => {
    expect(resolveContainedPath('/root', '/root/sub')).toBe('root/sub')
  })
  it('returns null for absolute outside root', () => {
    expect(resolveContainedPath('/root', '/etc/passwd')).toBeNull()
  })
})
