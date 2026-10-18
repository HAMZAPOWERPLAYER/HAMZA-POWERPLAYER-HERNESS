import { describe, expect, it } from 'vitest'
import { redactSecretAssignment, redactSecrets, REDACTED_PLACEHOLDER } from '../src/index.ts'

describe('redactSecrets', () => {
  it('redacts sk- keys', () => {
    expect(redactSecrets('key=sk-abcdefghijklmnopqrstuvwxyz')).toContain(REDACTED_PLACEHOLDER)
    expect(redactSecrets('key=sk-abcdefghijklmnopqrstuvwxyz')).not.toContain('sk-abc')
  })
  it('redacts bearer tokens', () => {
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toContain(REDACTED_PLACEHOLDER)
  })
  it('leaves plain text alone', () => {
    expect(redactSecrets('hello world')).toBe('hello world')
  })
  it('redacts jwt-like tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456ghi789'
    expect(redactSecrets(jwt)).toContain(REDACTED_PLACEHOLDER)
  })
})

describe('redactSecretAssignment', () => {
  it('redacts secret-like keys', () => {
    expect(redactSecretAssignment('API_KEY=supersecretvalue')).toBe(`API_KEY=${REDACTED_PLACEHOLDER}`)
    expect(redactSecretAssignment('password: hunter2')).toBe(`password: ${REDACTED_PLACEHOLDER}`)
  })
  it('leaves non-secret keys alone', () => {
    expect(redactSecretAssignment('PORT=3000')).toBe('PORT=3000')
  })
  it('returns non-assignment lines unchanged', () => {
    expect(redactSecretAssignment('hello')).toBe('hello')
  })
})
