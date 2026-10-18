import { describe, expect, it } from 'vitest'
import { summarizeBytes, truncateChars, truncateLines } from '../src/text-truncation.ts'

describe('truncateChars', () => {
  it('returns short text unchanged', () => {
    expect(truncateChars('hello', 10)).toEqual({ text: 'hello', truncated: false, removedChars: 0 })
  })
  it('returns text unchanged at the exact boundary', () => {
    expect(truncateChars('hello', 5)).toEqual({ text: 'hello', truncated: false, removedChars: 0 })
  })
  it('returns empty text unchanged at a zero budget', () => {
    expect(truncateChars('', 0)).toEqual({ text: '', truncated: false, removedChars: 0 })
  })
  it('accounts for the ellipsis inside the budget', () => {
    expect(truncateChars('hello world', 8)).toEqual({ text: 'hello w…', truncated: true, removedChars: 4 })
  })
  it('keeps the result within the budget', () => {
    expect(truncateChars('hello world', 8).text.length).toBe(8)
  })
  it('accounts for a custom ellipsis inside the budget', () => {
    expect(truncateChars('hello world', 10, '...')).toEqual({ text: 'hello w...', truncated: true, removedChars: 4 })
  })
  it('keeps an empty prefix when the ellipsis alone exceeds the budget', () => {
    expect(truncateChars('abcdef', 0)).toEqual({ text: '…', truncated: true, removedChars: 6 })
  })
  it('never produces a negative prefix', () => {
    expect(truncateChars('abc', -5)).toEqual({ text: '…', truncated: true, removedChars: 3 })
  })
  it('counts emoji by UTF-16 code units', () => {
    expect('😀'.length).toBe(2)
    expect(truncateChars('😀😀😀', 5)).toEqual({ text: '😀😀…', truncated: true, removedChars: 2 })
  })
  it('returns an emoji string unchanged at its code-unit length', () => {
    expect(truncateChars('😀', 2)).toEqual({ text: '😀', truncated: false, removedChars: 0 })
  })
})

describe('truncateLines', () => {
  it('returns text within the line budget unchanged', () => {
    expect(truncateLines('a\nb', 5)).toEqual({ text: 'a\nb', truncated: false, removedChars: 0 })
  })
  it('returns text unchanged at the exact line count', () => {
    expect(truncateLines('a\nb\nc', 3)).toEqual({ text: 'a\nb\nc', truncated: false, removedChars: 0 })
  })
  it('returns a single line unchanged at a budget of one', () => {
    expect(truncateLines('only', 1)).toEqual({ text: 'only', truncated: false, removedChars: 0 })
  })
  it('keeps one line', () => {
    expect(truncateLines('a\nb\nc', 1)).toEqual({ text: 'a', truncated: true, removedChars: 4 })
  })
  it('counts removed newline separators', () => {
    expect(truncateLines('a\nb\nc', 2)).toEqual({ text: 'a\nb', truncated: true, removedChars: 2 })
  })
  it('appends no marker', () => {
    expect(truncateLines('a\nb\nc', 2).text).toBe('a\nb')
  })
  it('drops a trailing newline beyond the budget', () => {
    expect(truncateLines('a\n', 1)).toEqual({ text: 'a', truncated: true, removedChars: 1 })
  })
  it('keeps nothing at a zero budget', () => {
    expect(truncateLines('a\nb', 0)).toEqual({ text: '', truncated: true, removedChars: 3 })
  })
  it('reports no truncation for empty text at a zero budget', () => {
    expect(truncateLines('', 0)).toEqual({ text: '', truncated: false, removedChars: 0 })
  })
  it('keeps nothing at a negative budget', () => {
    expect(truncateLines('abc', -1)).toEqual({ text: '', truncated: true, removedChars: 3 })
  })
})

describe('summarizeBytes', () => {
  it('formats zero', () => {
    expect(summarizeBytes(0)).toBe('0 B')
  })
  it('formats whole bytes below one kibibyte', () => {
    expect(summarizeBytes(512)).toBe('512 B')
    expect(summarizeBytes(1023)).toBe('1023 B')
  })
  it('formats kibibytes with one decimal', () => {
    expect(summarizeBytes(1024)).toBe('1.0 KiB')
    expect(summarizeBytes(1536)).toBe('1.5 KiB')
    expect(summarizeBytes(2048)).toBe('2.0 KiB')
  })
  it('formats mebibytes', () => {
    expect(summarizeBytes(1048576)).toBe('1.0 MiB')
    expect(summarizeBytes(2097152)).toBe('2.0 MiB')
  })
  it('formats gibibytes', () => {
    expect(summarizeBytes(1073741824)).toBe('1.0 GiB')
  })
  it('formats tebibytes', () => {
    expect(summarizeBytes(1099511627776)).toBe('1.0 TiB')
  })
  it('formats negative input as zero', () => {
    expect(summarizeBytes(-1)).toBe('0 B')
  })
  it('formats non-finite input as zero', () => {
    expect(summarizeBytes(Number.NaN)).toBe('0 B')
    expect(summarizeBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })
})
