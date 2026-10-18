import { describe, expect, it } from 'vitest'
import {
  assertNoUnredactedSecrets,
  buildDiagnostics,
  formatDiagnostics,
  type DiagnosticsReport,
} from '../src/environment-diagnostics.ts'
import { REDACTED_PLACEHOLDER } from '../src/secret-redaction.ts'

describe('buildDiagnostics', () => {
  it('keeps plain values unredacted and sorts entries by key', () => {
    const report = buildDiagnostics({ PORT: '3000', HOME: '/home/user', ZONE: 'us-east-1' })
    expect(report.entries).toEqual([
      { key: 'HOME', value: '/home/user', redacted: false },
      { key: 'PORT', value: '3000', redacted: false },
      { key: 'ZONE', value: 'us-east-1', redacted: false },
    ])
    expect(report.redactionCount).toBe(0)
  })

  it('redacts keys listed explicitly, compared case-insensitively', () => {
    const report = buildDiagnostics({ dbPassword: 'hunter2', PORT: '3000' }, ['DBPASSWORD'])
    expect(report.entries).toEqual([
      { key: 'PORT', value: '3000', redacted: false },
      { key: 'dbPassword', value: REDACTED_PLACEHOLDER, redacted: true },
    ])
    expect(report.redactionCount).toBe(1)
  })

  it('redacts secret-like key names without an explicit key list', () => {
    const report = buildDiagnostics({
      GITHUB_TOKEN: 'unused',
      DATABASE_PASSWORD: 'unused',
      AWS_SECRET_ACCESS_KEY: 'unused',
      REGION: 'us-east-1',
    })
    expect(report.entries).toEqual([
      { key: 'AWS_SECRET_ACCESS_KEY', value: REDACTED_PLACEHOLDER, redacted: true },
      { key: 'DATABASE_PASSWORD', value: REDACTED_PLACEHOLDER, redacted: true },
      { key: 'GITHUB_TOKEN', value: REDACTED_PLACEHOLDER, redacted: true },
      { key: 'REGION', value: 'us-east-1', redacted: false },
    ])
    expect(report.redactionCount).toBe(3)
  })

  it('redacts secret-shaped values under ordinary keys', () => {
    const report = buildDiagnostics({ LOG_LINE: 'authorization: Bearer abcdefghijklmnopqrstuvwxyz' })
    expect(report.entries).toEqual([
      { key: 'LOG_LINE', value: `authorization: ${REDACTED_PLACEHOLDER}`, redacted: true },
    ])
    expect(report.redactionCount).toBe(1)
  })

  it('leaves a value that only resembles a secret untouched', () => {
    const report = buildDiagnostics({ SHORT_CODE: 'sk-abc' })
    expect(report.entries).toEqual([{ key: 'SHORT_CODE', value: 'sk-abc', redacted: false }])
    expect(report.redactionCount).toBe(0)
  })

  it('redacts a secret-like key the assignment grammar cannot express', () => {
    const report = buildDiagnostics({ 'db-secret': 'value' })
    expect(report.entries).toEqual([{ key: 'db-secret', value: REDACTED_PLACEHOLDER, redacted: true }])
    expect(report.redactionCount).toBe(1)
  })

  it('counts key-driven and value-driven redactions together', () => {
    const report = buildDiagnostics({
      API_KEY: 'plain',
      TRACE: 'Bearer abcdefghijklmnopqrstuvwxyz',
      PORT: '80',
    })
    expect(report.entries).toEqual([
      { key: 'API_KEY', value: REDACTED_PLACEHOLDER, redacted: true },
      { key: 'PORT', value: '80', redacted: false },
      { key: 'TRACE', value: REDACTED_PLACEHOLDER, redacted: true },
    ])
    expect(report.redactionCount).toBe(2)
  })
})

describe('formatDiagnostics', () => {
  it('renders one key: value line per entry', () => {
    expect(formatDiagnostics(buildDiagnostics({ B: '2', A: '1' }))).toBe('A: 1\nB: 2')
  })

  it('renders the placeholder for redacted entries', () => {
    const text = formatDiagnostics(buildDiagnostics({ API_KEY: 'plain', PORT: '80' }))
    expect(text).toContain(`API_KEY: ${REDACTED_PLACEHOLDER}`)
    expect(text).toContain('PORT: 80')
  })

  it('returns an empty string for a report without entries', () => {
    expect(formatDiagnostics(buildDiagnostics({}))).toBe('')
  })
})

describe('assertNoUnredactedSecrets', () => {
  it('accepts a report in which every secret-bearing key is redacted', () => {
    const report = buildDiagnostics({ API_KEY: 'sk-abcdefghijklmnopqrstuvwxyz', PORT: '80' })
    expect(assertNoUnredactedSecrets(report)).toBeUndefined()
  })

  it('accepts a report whose keys name no secrets', () => {
    expect(assertNoUnredactedSecrets(buildDiagnostics({ PORT: '80' }))).toBeUndefined()
  })

  it('accepts report output for a key outside the assignment grammar', () => {
    expect(assertNoUnredactedSecrets(buildDiagnostics({ 'db-secret': 'value' }))).toBeUndefined()
  })

  it('throws listing every unredacted secret-bearing key', () => {
    const report: DiagnosticsReport = {
      entries: [
        { key: 'API_KEY', value: 'sk-abcdefghijklmnopqrstuvwxyz', redacted: false },
        { key: 'MIDDLE_NAME', value: 'Ada', redacted: false },
        { key: 'authToken', value: 'plain', redacted: false },
      ],
      redactionCount: 0,
    }
    expect(() => assertNoUnredactedSecrets(report)).toThrow(
      'unredacted secret-bearing key(s): API_KEY, authToken',
    )
  })

  it('ignores a redacted secret-bearing key', () => {
    const report: DiagnosticsReport = {
      entries: [{ key: 'DATABASE_PASSWORD', value: REDACTED_PLACEHOLDER, redacted: true }],
      redactionCount: 1,
    }
    expect(assertNoUnredactedSecrets(report)).toBeUndefined()
  })
})
