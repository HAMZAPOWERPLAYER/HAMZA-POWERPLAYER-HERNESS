import { describe, expect, it } from 'vitest'
import { buildRedactionReport, formatRedactionReport, hasRedactions } from '../src/redaction-report.ts'
import { REDACTED_PLACEHOLDER } from '../src/secret-redaction.ts'

describe('buildRedactionReport', () => {
  it('reports nothing for text without secrets', () => {
    const report = buildRedactionReport('hello world', ['api-key'])
    expect(report.redactedText).toBe('hello world')
    expect(report.findings).toEqual([])
    expect(report.totalRedactions).toBe(0)
  })

  it('redacts an sk- key and attributes it to the label the text mentions', () => {
    const report = buildRedactionReport('api-key: sk-abcdefghijklmnopqrstuvwxyz', ['api-key'])
    expect(report.redactedText).toBe(`api-key: ${REDACTED_PLACEHOLDER}`)
    expect(report.findings).toEqual([{ label: 'api-key', count: 1 }])
    expect(report.totalRedactions).toBe(1)
  })

  it('matches labels case-insensitively without rewriting them', () => {
    const report = buildRedactionReport('API-KEY: sk-abcdefghijklmnopqrstuvwxyz', ['api-key'])
    expect(report.findings).toEqual([{ label: 'api-key', count: 1 }])
  })

  it('omits a label the source text never mentions', () => {
    const report = buildRedactionReport('api-key: sk-abcdefghijklmnopqrstuvwxyz', ['github-token'])
    expect(report.findings).toEqual([])
    expect(report.totalRedactions).toBe(1)
  })

  it('sorts findings by label and counts the placeholders per finding', () => {
    const text = 'beta-label: sk-aaaaaaaaaaaaaaaaaaaa alpha-label: sk-bbbbbbbbbbbbbbbbbbbb'
    const report = buildRedactionReport(text, ['beta-label', 'alpha-label'])
    expect(report.totalRedactions).toBe(2)
    expect(report.findings).toEqual([
      { label: 'alpha-label', count: 2 },
      { label: 'beta-label', count: 2 },
    ])
  })

  it('emits no finding for a mentioned label when nothing was redacted', () => {
    const report = buildRedactionReport('the api-key is missing', ['api-key'])
    expect(report.findings).toEqual([])
    expect(report.totalRedactions).toBe(0)
  })
})

describe('hasRedactions', () => {
  it('is true when a secret was replaced', () => {
    expect(hasRedactions(buildRedactionReport('key=sk-abcdefghijklmnopqrstuvwxyz', []))).toBe(true)
  })

  it('is false when nothing was replaced', () => {
    expect(hasRedactions(buildRedactionReport('port=3000', []))).toBe(false)
  })
})

describe('formatRedactionReport', () => {
  it('reports no redactions when nothing was replaced', () => {
    expect(formatRedactionReport(buildRedactionReport('hello world', []))).toBe('no redactions')
  })

  it('lists each finding and the total', () => {
    const text = 'beta-label: sk-aaaaaaaaaaaaaaaaaaaa alpha-label: sk-bbbbbbbbbbbbbbbbbbbb'
    const report = buildRedactionReport(text, ['beta-label', 'alpha-label'])
    expect(formatRedactionReport(report)).toBe('alpha-label: 2\nbeta-label: 2\ntotal: 2')
  })
})
