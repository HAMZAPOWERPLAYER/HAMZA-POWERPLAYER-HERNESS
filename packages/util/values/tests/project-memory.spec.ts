import { describe, expect, it } from 'vitest'
import {
  containsCredential,
  invalidateMemory,
  isAssumption,
  isVerifiedMemory,
  triggerInvalidates,
  validateMemory,
  type MemoryEntry,
} from '../src/project-memory.ts'

const baseEntry: MemoryEntry = {
  id: '1',
  category: 'architecture',
  content: 'use component-based design',
  confidence: 'verified',
  source: 'user',
  createdAt: 1000,
  invalidated: false,
}

describe('isVerifiedMemory', () => {
  it('reports verified non-invalidated entries as verified', () => {
    expect(isVerifiedMemory({ ...baseEntry, validatedAt: 2000 })).toBe(true)
  })

  it('reports invalidated entries as not verified', () => {
    expect(isVerifiedMemory({ ...baseEntry, invalidated: true, validatedAt: 2000 })).toBe(false)
  })

  it('reports entries without validation time as not verified', () => {
    expect(isVerifiedMemory(baseEntry)).toBe(false)
  })

  it('reports assumption entries as not verified', () => {
    expect(isVerifiedMemory({ ...baseEntry, confidence: 'assumption', validatedAt: 2000 })).toBe(false)
  })
})

describe('isAssumption', () => {
  it('reports assumptions', () => {
    expect(isAssumption({ ...baseEntry, confidence: 'assumption' })).toBe(true)
    expect(isAssumption({ ...baseEntry, confidence: 'suggested' })).toBe(true)
  })

  it('reports verified entries as not assumptions', () => {
    expect(isAssumption(baseEntry)).toBe(false)
  })
})

describe('validateMemory', () => {
  it('sets validatedAt and does not invalidate', () => {
    const next = validateMemory(baseEntry, 3000)
    expect(next.validatedAt).toBe(3000)
    expect(next.invalidated).toBe(false)
  })

  it('leaves invalidated entries unchanged', () => {
    const invalid: MemoryEntry = { ...baseEntry, invalidated: true, invalidationReason: 'changed' }
    const next = validateMemory(invalid, 3000)
    expect(next).toBe(invalid)
  })
})

describe('invalidateMemory', () => {
  it('marks entry invalidated with reason', () => {
    const next = invalidateMemory(baseEntry, 'source-changed')
    expect(next.invalidated).toBe(true)
    expect(next.invalidationReason).toBe('source-changed')
    expect(next.id).toBe(baseEntry.id)
  })
})

describe('triggerInvalidates', () => {
  it('invalidates architecture on source change', () => {
    expect(triggerInvalidates('source-changed', baseEntry)).toBe(true)
  })

  it('does not invalidate test-instruction on source change', () => {
    const entry: MemoryEntry = { ...baseEntry, category: 'test-instruction', confidence: 'verified' }
    expect(triggerInvalidates('source-changed', entry)).toBe(false)
  })

  it('invalidates any entry on test contradiction', () => {
    expect(triggerInvalidates('test-contradiction', baseEntry)).toBe(true)
  })

  it('invalidates resolved-defect on fix-no-longer-applies', () => {
    const entry: MemoryEntry = { ...baseEntry, category: 'resolved-defect' }
    expect(triggerInvalidates('fix-no-longer-applies', entry)).toBe(true)
  })
})

describe('containsCredential', () => {
  it('detects password-like content', () => {
    expect(containsCredential('password = hunter2')).toBe(true)
  })

  it('detects API keys', () => {
    expect(containsCredential('sk-abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true)
  })

  it('reports false for ordinary text', () => {
    expect(containsCredential('use component-based design')).toBe(false)
  })
})
