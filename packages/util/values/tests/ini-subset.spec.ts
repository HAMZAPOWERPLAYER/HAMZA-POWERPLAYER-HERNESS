import { describe, expect, it } from 'vitest'
import { scanIniSubset, type IniLine } from '../src/ini-subset.ts'

describe('scanIniSubset', () => {
  it('returns an empty list for empty input', () => {
    expect(scanIniSubset('')).toEqual([])
  })

  it('ignores blank lines and comments', () => {
    const text = '\n; comment\n# also a comment\nkey = value\n'
    expect(scanIniSubset(text)).toEqual([
      { kind: 'entry', section: null, key: 'key', value: 'value' },
    ])
  })

  it('tracks the current section for entries', () => {
    const text = '[section]\nkey = value\n'
    expect(scanIniSubset(text)).toEqual([
      { kind: 'section', name: 'section' },
      { kind: 'entry', section: 'section', key: 'key', value: 'value' },
    ])
  })

  it('trims keys and values', () => {
    const text = '  key  =  value with spaces  '
    expect(scanIniSubset(text)).toEqual([
      { kind: 'entry', section: null, key: 'key', value: 'value with spaces' },
    ])
  })

  it('skips lines without an equals separator or with an empty key', () => {
    const text = 'noequals\n = value\nkey =\n'
    expect(scanIniSubset(text)).toEqual([
      { kind: 'entry', section: null, key: 'key', value: '' },
    ])
  })

  it('does not process escapes or quotes', () => {
    const text = 'key = "quoted\\nvalue"'
    expect(scanIniSubset(text)).toEqual([
      { kind: 'entry', section: null, key: 'key', value: '"quoted\\nvalue"' },
    ])
  })

  it('trims section names', () => {
    const text = '[  section  ]\n'
    expect(scanIniSubset(text)).toEqual([
      { kind: 'section', name: 'section' },
    ])
  })

  it('preserves document order across sections', () => {
    const text = '[a]\nx = 1\n[b]\ny = 2\n'
    const result = scanIniSubset(text)
    expect(result.map((l: IniLine) => l.kind)).toEqual(['section', 'entry', 'section', 'entry'])
  })
})
