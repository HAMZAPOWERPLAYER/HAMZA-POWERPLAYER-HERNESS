import { describe, expect, it } from 'vitest'
import { digestLog, formatLogDigest, hasErrors } from '../src/log-digest.ts'

describe('digestLog counts', () => {
  it('returns all zeros for empty text', () => {
    expect(digestLog('')).toEqual({ lines: 0, errorCount: 0, warningCount: 0, errors: [], warnings: [] })
  })
  it('counts lines without a trailing newline', () => {
    expect(digestLog('a\nb\nc').lines).toBe(3)
    expect(digestLog('a\nb\nc\n').lines).toBe(3)
  })
  it('strips only one trailing newline', () => {
    const digest = digestLog('error boom\n\n')
    expect(digest.lines).toBe(2)
    expect(digest.errorCount).toBe(1)
  })
  it('normalizes CRLF and bare CR line endings', () => {
    const crlf = digestLog('ok\r\nerror boom')
    expect(crlf.lines).toBe(2)
    expect(crlf.errors[0]?.text).toBe('error boom')
    const cr = digestLog('ok\rwarning soon')
    expect(cr.lines).toBe(2)
    expect(cr.warnings[0]?.line).toBe(2)
  })
  it('ignores lines without a severity keyword', () => {
    expect(digestLog('build succeeded')).toEqual({ lines: 1, errorCount: 0, warningCount: 0, errors: [], warnings: [] })
  })
  it('matches error keywords case-insensitively', () => {
    expect(digestLog('ERROR: boom').errorCount).toBe(1)
  })
  it('recognizes every error keyword', () => {
    const digest = digestLog('fatal: boom\nfailed to link\nfailure in step\nexception thrown')
    expect(digest.errorCount).toBe(4)
    expect(digest.errors).toHaveLength(4)
  })
  it('recognizes the cannot find phrase', () => {
    expect(digestLog('cannot find module x').errorCount).toBe(1)
  })
  it('recognizes warnings', () => {
    const digest = digestLog('warn: deprecated\nwarning: unused variable')
    expect(digest.warningCount).toBe(2)
    expect(digest.errors).toHaveLength(0)
  })
  it('classifies a line matching both patterns as an error', () => {
    const digest = digestLog('warning: error in plugin')
    expect(digest.errorCount).toBe(1)
    expect(digest.warningCount).toBe(0)
    expect(digest.warnings).toHaveLength(0)
  })
  it('requires word boundaries around keywords', () => {
    const digest = digestLog('erroring out\nwarned user')
    expect(digest.lines).toBe(2)
    expect(digest.errorCount).toBe(0)
    expect(digest.warningCount).toBe(0)
  })
  it('numbers lines across blank lines', () => {
    const digest = digestLog('head\n\nfatal boom')
    expect(digest.lines).toBe(3)
    expect(digest.errors).toHaveLength(1)
    expect(digest.errors[0]?.line).toBe(3)
    expect(digest.errors[0]?.text).toBe('fatal boom')
  })
})

describe('digestLog entries', () => {
  it('counts duplicate lines while keeping one entry', () => {
    const digest = digestLog('error same\nerror same\nerror same')
    expect(digest.errorCount).toBe(3)
    expect(digest.errors).toHaveLength(1)
  })
  it('keeps the first line number of a repeated entry', () => {
    const digest = digestLog('ok\nerror same\nok\nerror same')
    expect(digest.errors).toHaveLength(1)
    expect(digest.errors[0]?.line).toBe(2)
  })
  it('lists entries in first-appearance order', () => {
    const digest = digestLog('error first\nerror second\nerror third')
    expect(digest.errors.map(entry => entry.text)).toEqual(['error first', 'error second', 'error third'])
  })
  it('records the severity on each entry', () => {
    const digest = digestLog('error boom\nwarning careful')
    expect(digest.errors[0]?.severity).toBe('error')
    expect(digest.warnings[0]?.severity).toBe('warning')
  })
  it('caps entries at the default of 20 while counting every line', () => {
    const lines = Array.from({ length: 25 }, (_, index) => `error number ${index}`)
    const digest = digestLog(lines.join('\n'))
    expect(digest.lines).toBe(25)
    expect(digest.errorCount).toBe(25)
    expect(digest.errors).toHaveLength(20)
    expect(digest.errorCount).toBeGreaterThan(digest.errors.length)
    expect(digest.errors.map(entry => entry.text)).toEqual(lines.slice(0, 20))
  })
  it('caps entries at an explicit limit', () => {
    const digest = digestLog('error one\nerror two\nerror three', { maxEntriesPerSeverity: 2 })
    expect(digest.errorCount).toBe(3)
    expect(digest.errors).toHaveLength(2)
  })
  it('de-duplicates before applying the cap', () => {
    const digest = digestLog('error one\nerror one\nerror two', { maxEntriesPerSeverity: 2 })
    expect(digest.errors.map(entry => entry.text)).toEqual(['error one', 'error two'])
  })
  it('caps warnings independently of errors', () => {
    const digest = digestLog('error one\nwarning one\nwarning two\nwarning three', { maxEntriesPerSeverity: 2 })
    expect(digest.errors).toHaveLength(1)
    expect(digest.warnings).toHaveLength(2)
    expect(digest.warningCount).toBe(3)
  })
})

describe('digestLog text truncation', () => {
  it('keeps a line exactly at the default text budget', () => {
    const line = `error ${'x'.repeat(294)}`
    const digest = digestLog(line)
    expect(line).toHaveLength(300)
    expect(digest.errors[0]?.text).toBe(line)
  })
  it('appends a marker beyond the default text budget', () => {
    const digest = digestLog(`error ${'x'.repeat(295)}`)
    expect(digest.errors[0]?.text).toBe(`error ${'x'.repeat(294)}...`)
  })
  it('appends a marker beyond an explicit text budget', () => {
    const digest = digestLog('error abcdef', { maxTextLength: 9 })
    expect(digest.errors[0]?.text).toBe('error abc...')
  })
  it('truncates before de-duplication so shared prefixes collapse', () => {
    const digest = digestLog(`error ${'a'.repeat(20)}\nerror ${'a'.repeat(20)}b`, { maxTextLength: 12 })
    expect(digest.errorCount).toBe(2)
    expect(digest.errors).toHaveLength(1)
    expect(digest.errors[0]?.text).toBe(`error ${'a'.repeat(6)}...`)
  })
  it('truncates warning entries too', () => {
    const digest = digestLog('warning abcdef', { maxTextLength: 7 })
    expect(digest.warnings[0]?.text).toBe('warning...')
  })
})

describe('digestLog option validation', () => {
  it('rejects an entry cap below one', () => {
    expect(() => digestLog('error boom', { maxEntriesPerSeverity: 0 })).toThrow(/maxEntriesPerSeverity/)
    expect(() => digestLog('error boom', { maxEntriesPerSeverity: -1 })).toThrow(/maxEntriesPerSeverity/)
  })
  it('rejects a text budget below one', () => {
    expect(() => digestLog('error boom', { maxTextLength: 0 })).toThrow(/maxTextLength/)
    expect(() => digestLog('error boom', { maxTextLength: -5 })).toThrow(/maxTextLength/)
  })
})

describe('hasErrors', () => {
  it('reports true for a counted error line', () => {
    expect(hasErrors(digestLog('error boom'))).toBe(true)
  })
  it('reports false without error lines', () => {
    expect(hasErrors(digestLog('warning careful'))).toBe(false)
    expect(hasErrors(digestLog(''))).toBe(false)
  })
  it('reports true when counted lines exceed the retained entries', () => {
    expect(hasErrors(digestLog('error one\nerror two', { maxEntriesPerSeverity: 1 }))).toBe(true)
    expect(hasErrors({ lines: 3, errorCount: 2, warningCount: 0, errors: [], warnings: [] })).toBe(true)
  })
})

describe('formatLogDigest', () => {
  it('renders only the counts line without entries', () => {
    expect(formatLogDigest(digestLog(''))).toBe('0 lines, 0 errors, 0 warnings')
    expect(formatLogDigest(digestLog('build ok\ncopy ok'))).toBe('2 lines, 0 errors, 0 warnings')
  })
  it('orders the counts line, error run, then warning run', () => {
    const rendered = formatLogDigest(digestLog('warning careful\nerror boom'))
    expect(rendered.split('\n')[0]).toMatch(/^\d+ lines, \d+ errors, \d+ warnings$/)
    expect(rendered).toBe('2 lines, 1 errors, 1 warnings\nerror: line 2: error boom\nwarning: line 1: warning careful')
  })
  it('renders nothing after the warning run', () => {
    const rendered = formatLogDigest(digestLog('error boom\nwarning careful'))
    expect(rendered.split('\n')).toHaveLength(3)
    expect(rendered.endsWith('warning: line 2: warning careful')).toBe(true)
  })
  it('renders truncated entry text as stored', () => {
    const rendered = formatLogDigest(digestLog('error abcdef', { maxTextLength: 9 }))
    expect(rendered).toContain('error: line 1: error abc...')
  })
})
