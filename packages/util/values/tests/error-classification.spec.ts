import { describe, expect, it } from 'vitest'
import {
  classifyError,
  errorMessage,
  isRetryableError,
} from '../src/index.ts'

describe('classifyError', () => {
  it('transient for retryable status codes', () => {
    expect(classifyError({ message: 'x', statusCode: 408 }).category).toBe('transient')
    expect(classifyError({ message: 'x', statusCode: 429 }).retryable).toBe(true)
    expect(classifyError({ message: 'x', statusCode: 503 }).category).toBe('transient')
  })
  it('not-found for 404', () => {
    expect(classifyError({ message: 'x', statusCode: 404 })).toMatchObject({ category: 'not-found', retryable: false })
  })
  it('permission for 401/403', () => {
    expect(classifyError({ message: 'x', statusCode: 401 }).category).toBe('permission')
    expect(classifyError({ message: 'x', statusCode: 403 }).category).toBe('permission')
  })
  it('validation for 400/422', () => {
    expect(classifyError({ message: 'x', statusCode: 400 }).category).toBe('validation')
    expect(classifyError({ message: 'x', statusCode: 422 }).category).toBe('validation')
  })
  it('falls through for other status codes', () => {
    expect(classifyError({ message: 'something odd', statusCode: 418 }).category).toBe('unknown')
  })
  it('transient for timeout/network text', () => {
    expect(classifyError({ message: 'request timeout' }).category).toBe('transient')
    expect(classifyError({ message: 'ok', code: 'ECONNRESET' }).retryable).toBe(true)
  })
  it('not-found for ENOENT', () => {
    expect(classifyError({ message: 'ok', code: 'ENOENT' }).category).toBe('not-found')
  })
  it('permission for EACCES', () => {
    expect(classifyError({ message: 'ok', code: 'EACCES' }).category).toBe('permission')
  })
  it('validation for malformed', () => {
    expect(classifyError({ message: 'malformed json' }).category).toBe('validation')
  })
  it('unknown by default', () => {
    expect(classifyError({ message: 'weird' })).toMatchObject({ category: 'unknown', retryable: false })
  })
})

describe('isRetryableError', () => {
  it('reads the retryable flag', () => {
    expect(isRetryableError({ category: 'transient', retryable: true, message: 'x' })).toBe(true)
    expect(isRetryableError({ category: 'permanent', retryable: false, message: 'x' })).toBe(false)
  })
})

describe('errorMessage', () => {
  it('extracts Error messages', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })
  it('stringifies non-errors', () => {
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage(42)).toBe('42')
  })
})
