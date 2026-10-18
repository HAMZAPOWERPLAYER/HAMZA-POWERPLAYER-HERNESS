import { describe, expect, it } from 'vitest'
import {
  isAbsolutePortablePath,
  isPortablePathInside,
  joinPortable,
  normalizePortablePath,
  portableBasename,
  portableDirname,
  portableExtension,
  toPosixPath,
} from '../src/portable-path.ts'

describe('toPosixPath', () => {
  it('rewrites backslashes in a windows path', () => {
    expect(toPosixPath('C:\\Users\\dev\\a.txt')).toBe('C:/Users/dev/a.txt')
  })
  it('leaves a posix path unchanged and empty text empty', () => {
    expect(toPosixPath('/usr/local/bin')).toBe('/usr/local/bin')
    expect(toPosixPath('')).toBe('')
  })
  it('rewrites mixed separators', () => {
    expect(toPosixPath('a\\b/c\\d')).toBe('a/b/c/d')
  })
})

describe('normalizePortablePath', () => {
  it('returns empty text for empty input', () => {
    expect(normalizePortablePath('')).toBe('')
  })
  it('keeps a single leading slash for roots and UNC prefixes', () => {
    expect(normalizePortablePath('/')).toBe('/')
    expect(normalizePortablePath('///')).toBe('/')
    expect(normalizePortablePath('//server/share')).toBe('/server/share')
  })
  it('drops empty and dot segments', () => {
    expect(normalizePortablePath('a//b/./c')).toBe('a/b/c')
  })
  it('resolves parent segments', () => {
    expect(normalizePortablePath('a/b/../c')).toBe('a/c')
  })
  it('normalizes separators before resolving parent segments', () => {
    expect(normalizePortablePath('a\\b\\..\\c')).toBe('a/c')
  })
  it('keeps a leading parent segment that cannot pop', () => {
    expect(normalizePortablePath('../a')).toBe('../a')
    expect(normalizePortablePath('..')).toBe('..')
    expect(normalizePortablePath('../../a')).toBe('../../a')
  })
  it('resolves above a relative name into a leading parent segment', () => {
    expect(normalizePortablePath('a/../../b')).toBe('../b')
  })
  it('does not cross the root of an absolute path', () => {
    expect(normalizePortablePath('/..')).toBe('/')
    expect(normalizePortablePath('/../a')).toBe('/a')
  })
  it('reports a lone drive segment as a drive root', () => {
    expect(normalizePortablePath('C:')).toBe('C:/')
    expect(normalizePortablePath('C:/')).toBe('C:/')
  })
  it('keeps drive paths', () => {
    expect(normalizePortablePath('C:\\Users\\..\\Temp')).toBe('C:/Temp')
  })
  it('never pops a drive segment', () => {
    expect(normalizePortablePath('C:/..')).toBe('C:/')
    expect(normalizePortablePath('C:/a/../../b')).toBe('C:/b')
  })
  it('leaves a drive-relative path unresolved', () => {
    expect(normalizePortablePath('C:foo')).toBe('C:foo')
  })
})

describe('isAbsolutePortablePath', () => {
  it('accepts a leading slash', () => {
    expect(isAbsolutePortablePath('/a/b')).toBe(true)
  })
  it('accepts a UNC prefix in either separator style', () => {
    expect(isAbsolutePortablePath('//server/share')).toBe(true)
    expect(isAbsolutePortablePath('\\\\server\\share')).toBe(true)
  })
  it('accepts a drive letter with a slash', () => {
    expect(isAbsolutePortablePath('C:/x')).toBe(true)
  })
  it('accepts a drive letter without a slash', () => {
    expect(isAbsolutePortablePath('C:x')).toBe(true)
  })
  it('rejects relative names and empty text', () => {
    expect(isAbsolutePortablePath('a/b')).toBe(false)
    expect(isAbsolutePortablePath('')).toBe(false)
  })
})

describe('portableBasename', () => {
  it('returns the last segment', () => {
    expect(portableBasename('/a/b/c.ts')).toBe('c.ts')
  })
  it('returns the name before a trailing slash', () => {
    expect(portableBasename('/a/b/')).toBe('b')
    expect(portableBasename('a\\b.txt')).toBe('b.txt')
  })
  it('returns empty text for roots and for empty results', () => {
    expect(portableBasename('/')).toBe('')
    expect(portableBasename('C:/')).toBe('')
    expect(portableBasename('a/..')).toBe('')
  })
  it('returns the name of a drive path', () => {
    expect(portableBasename('C:/a/b')).toBe('b')
  })
})

describe('portableDirname', () => {
  it('returns the parent of a relative path', () => {
    expect(portableDirname('a/b/c.ts')).toBe('a/b')
  })
  it('returns dot for a bare name', () => {
    expect(portableDirname('a')).toBe('.')
    expect(portableDirname('a/')).toBe('.')
  })
  it('returns the posix root for a one-level absolute path', () => {
    expect(portableDirname('/a')).toBe('/')
    expect(portableDirname('/')).toBe('/')
  })
  it('ignores a trailing slash', () => {
    expect(portableDirname('/a/b/')).toBe('/a')
  })
  it('appends a slash to a drive parent', () => {
    expect(portableDirname('C:/a')).toBe('C:/')
    expect(portableDirname('C:/a/b')).toBe('C:/a')
  })
})

describe('portableExtension', () => {
  it('returns the extension with its leading dot', () => {
    expect(portableExtension('a.ts')).toBe('.ts')
    expect(portableExtension('a.tar.gz')).toBe('.gz')
    expect(portableExtension('/x/b.spec.ts')).toBe('.ts')
  })
  it('returns empty text without an extension', () => {
    expect(portableExtension('a')).toBe('')
    expect(portableExtension('.gitignore')).toBe('')
    expect(portableExtension('dir.d/file')).toBe('')
  })
  it('returns empty text for a root', () => {
    expect(portableExtension('/')).toBe('')
  })
})

describe('joinPortable', () => {
  it('joins parts with a single separator', () => {
    expect(joinPortable('a', 'b')).toBe('a/b')
    expect(joinPortable('a/', 'b')).toBe('a/b')
    expect(joinPortable('a', '', 'b')).toBe('a/b')
  })
  it('returns empty text when every part is empty', () => {
    expect(joinPortable('', '', '')).toBe('')
    expect(joinPortable()).toBe('')
  })
  it('replaces everything before a later absolute part', () => {
    expect(joinPortable('a', '/b')).toBe('/b')
  })
  it('joins a drive root with a relative part', () => {
    expect(joinPortable('C:/', 'Users')).toBe('C:/Users')
  })
  it('keeps a UNC prefix without adding another separator', () => {
    expect(joinPortable('//server/share', 'x')).toBe('//server/share/x')
  })
})

describe('isPortablePathInside', () => {
  it('is true for equal paths', () => {
    expect(isPortablePathInside('a/b', 'a/b')).toBe(true)
  })
  it('is true for a nested path', () => {
    expect(isPortablePathInside('a/b', 'a/b/c')).toBe(true)
  })
  it('is false for a sibling', () => {
    expect(isPortablePathInside('a/b', 'a/c')).toBe(false)
  })
  it('is false for a name that only shares prefix text', () => {
    expect(isPortablePathInside('a/b', 'a/bc')).toBe(false)
  })
  it('is false across drives and letter case', () => {
    expect(isPortablePathInside('C:/a', 'D:/a/b')).toBe(false)
    expect(isPortablePathInside('C:/a', 'C:/A/b')).toBe(false)
  })
  it('compares normalized forms', () => {
    expect(isPortablePathInside('a/b/..', 'a/c')).toBe(true)
  })
  it('is false when the parent normalizes to empty text', () => {
    expect(isPortablePathInside('', 'a')).toBe(false)
  })
})
