import { describe, expect, it } from 'vitest'
import { formatRedactedSessionLog, hasRedactedSecrets, redactSessionLog } from '../src/session-log-redaction.ts'

describe('redactSessionLog', () => {
  it('leaves clean text unchanged', () => {
    const r = redactSessionLog('hello world')
    expect(r.redactedText).toBe('hello world')
    expect(r.redactionCount).toBe(0)
    expect(r.hadSecrets).toBe(false)
    expect(hasRedactedSecrets(r)).toBe(false)
  })

  it('redacts an sk- key', () => {
    const r = redactSessionLog('token sk-abcdefghijklmnopqrstuvwxyz')
    expect(r.redactedText).toContain('[REDACTED]')
    expect(r.redactionCount).toBeGreaterThan(0)
    expect(r.hadSecrets).toBe(true)
  })

  it('counts multiple redactions', () => {
    const r = redactSessionLog('a sk-abcdefghijklmnopqrstuvwxyz b sk-abcdefghijklmnopqrstuvwxyz')
    expect(r.redactionCount).toBe(2)
  })

  it('accepts secret keys without changing the count logic', () => {
    const r = redactSessionLog('nothing here', ['API_KEY'])
    expect(r.hadSecrets).toBe(false)
    expect(r.redactionCount).toBe(0)
  })

  it('formats both branches', () => {
    expect(formatRedactedSessionLog(redactSessionLog('clean'))).toBe('no secrets redacted')
    const r = redactSessionLog('sk-abcdefghijklmnopqrstuvwxyz')
    expect(formatRedactedSessionLog(r)).toContain('secret(s) redacted')
  })
})
