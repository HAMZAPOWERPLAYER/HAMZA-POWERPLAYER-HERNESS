import { describe, expect, it } from 'vitest'
import {
  classifyIdempotency,
  mayRetryBlindly,
  requiresStateInspection,
} from '../src/idempotency.ts'

describe('classifyIdempotency', () => {
  it('classifies read-only operations', () => {
    expect(classifyIdempotency('read file', false, false)).toBe('read')
    expect(classifyIdempotency('list files', false, false)).toBe('read')
    expect(classifyIdempotency('inspect config', false, false)).toBe('read')
  })

  it('classifies side-effecting reversible operations as idempotent-write', () => {
    expect(classifyIdempotency('write file', true, true)).toBe('idempotent-write')
  })

  it('classifies non-reversible side-effecting operations as non-idempotent', () => {
    expect(classifyIdempotency('delete file', true, false)).toBe('non-idempotent')
    expect(classifyIdempotency('send email', true, false)).toBe('non-idempotent')
  })

  it('falls back to unknown when not read-like', () => {
    expect(classifyIdempotency('mystery op', true, false)).toBe('non-idempotent')
  })
})

describe('mayRetryBlindly', () => {
  it('allows blind retry for read operations', () => {
    expect(mayRetryBlindly({ name: 'read', idempotency: 'read', hasSideEffects: false })).toBe(true)
  })

  it('allows blind retry for idempotent writes', () => {
    expect(mayRetryBlindly({ name: 'write', idempotency: 'idempotent-write', hasSideEffects: true })).toBe(true)
  })

  it('denies blind retry for non-idempotent and unknown', () => {
    expect(mayRetryBlindly({ name: 'delete', idempotency: 'non-idempotent', hasSideEffects: true })).toBe(false)
    expect(mayRetryBlindly({ name: 'mystery', idempotency: 'unknown', hasSideEffects: true })).toBe(false)
  })
})

describe('requiresStateInspection', () => {
  it('requires inspection for non-idempotent operations', () => {
    expect(requiresStateInspection({ name: 'delete', idempotency: 'non-idempotent', hasSideEffects: true })).toBe(true)
  })

  it('requires inspection for unknown operations', () => {
    expect(requiresStateInspection({ name: 'mystery', idempotency: 'unknown', hasSideEffects: true })).toBe(true)
  })

  it('does not require inspection for read operations', () => {
    expect(requiresStateInspection({ name: 'read', idempotency: 'read', hasSideEffects: false })).toBe(false)
  })
})
