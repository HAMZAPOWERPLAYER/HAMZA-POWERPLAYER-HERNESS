import { describe, expect, it } from 'vitest'
import { routeModel, type RoutingCandidate, type RoutingRequirements } from '../src/model-router.ts'

const baseCandidates: RoutingCandidate[] = [
  { providerId: 'deepseek', modelId: 'deepseek-chat', capabilities: ['text', 'tool-calling'], available: true, privacyAllowed: true, maxContextTokens: 128000 },
  { providerId: 'deepseek', modelId: 'deepseek-vision', capabilities: ['text', 'image-input', 'tool-calling'], available: true, privacyAllowed: true, maxContextTokens: 128000 },
  { providerId: 'local', modelId: 'llama-local', capabilities: ['text'], available: true, privacyAllowed: true, maxContextTokens: 8000 },
  { providerId: 'unavailable', modelId: 'down', capabilities: ['text'], available: false, privacyAllowed: true, maxContextTokens: 32000 },
]

describe('routeModel', () => {
  it('selects a candidate that satisfies required capabilities', () => {
    const req: RoutingRequirements = { requiredCapabilities: ['text'], minContextTokens: 1000, dataSensitivity: 'public' }
    const decision = routeModel(req, baseCandidates)
    expect(decision.providerId).toBe('deepseek')
    expect(decision.modelId).toBe('deepseek-chat')
    expect(decision.usedFallback).toBe(false)
  })

  it('rejects candidates missing required capabilities', () => {
    const req: RoutingRequirements = { requiredCapabilities: ['image-input'], minContextTokens: 1000, dataSensitivity: 'public' }
    const decision = routeModel(req, baseCandidates)
    expect(decision.providerId).toBe('deepseek')
    expect(decision.modelId).toBe('deepseek-vision')
  })

  it('returns null when no candidate is available', () => {
    const req: RoutingRequirements = { requiredCapabilities: ['text'], minContextTokens: 1000, dataSensitivity: 'public' }
    const decision = routeModel(req, [{ providerId: 'x', modelId: 'y', capabilities: ['text'], available: false, privacyAllowed: true, maxContextTokens: 1000 }])
    expect(decision.providerId).toBeNull()
    expect(decision.modelId).toBeNull()
  })

  it('respects explicit user selection when capable', () => {
    const req: RoutingRequirements = {
      requiredCapabilities: ['text'],
      minContextTokens: 1000,
      dataSensitivity: 'public',
      userSelection: { providerId: 'local', modelId: 'llama-local' },
    }
    const decision = routeModel(req, baseCandidates)
    expect(decision.providerId).toBe('local')
    expect(decision.modelId).toBe('llama-local')
    expect(decision.fromUserOverride).toBe(true)
    expect(decision.explanation).toContain('user explicitly chose')
  })

  it('rejects explicit selection that lacks a capability', () => {
    const req: RoutingRequirements = {
      requiredCapabilities: ['image-input'],
      minContextTokens: 1000,
      dataSensitivity: 'public',
      userSelection: { providerId: 'deepseek', modelId: 'deepseek-chat' },
    }
    const decision = routeModel(req, baseCandidates)
    expect(decision.providerId).toBe('deepseek')
    expect(decision.modelId).toBe('deepseek-vision')
    expect(decision.usedFallback).toBe(true)
  })

  it('rejects explicit selection that is unavailable', () => {
    const req: RoutingRequirements = {
      requiredCapabilities: ['text'],
      minContextTokens: 1000,
      dataSensitivity: 'public',
      userSelection: { providerId: 'unavailable', modelId: 'down' },
    }
    const decision = routeModel(req, baseCandidates)
    expect(decision.providerId).toBe('deepseek')
    expect(decision.usedFallback).toBe(true)
  })

  it('respects privacy restrictions', () => {
    const req: RoutingRequirements = {
      requiredCapabilities: ['text'],
      minContextTokens: 1000,
      dataSensitivity: 'confidential',
      userSelection: { providerId: 'deepseek', modelId: 'deepseek-chat' },
    }
    const notAllowed = { ...baseCandidates[0], privacyAllowed: false }
    const candidates = [notAllowed, baseCandidates[2]]
    const decision = routeModel(req, candidates)
    expect(decision.providerId).toBe('local')
  })

  it('rejects insufficient context capacity', () => {
    const req: RoutingRequirements = { requiredCapabilities: ['text'], minContextTokens: 1000000, dataSensitivity: 'public' }
    const decision = routeModel(req, baseCandidates)
    expect(decision.providerId).toBeNull()
  })

  it('reports rejected candidates with reasons', () => {
    const req: RoutingRequirements = { requiredCapabilities: ['image-input'], minContextTokens: 1000, dataSensitivity: 'public' }
    const decision = routeModel(req, baseCandidates)
    expect(decision.rejected.length).toBeGreaterThan(0)
    expect(decision.rejected[0]!.reason).toContain('missing capabilities')
  })

  it('does not silently switch when no candidate fits', () => {
    const req: RoutingRequirements = { requiredCapabilities: ['nonexistent-capability'], minContextTokens: 1000, dataSensitivity: 'public' }
    const decision = routeModel(req, baseCandidates)
    expect(decision.providerId).toBeNull()
    expect(decision.modelId).toBeNull()
  })
})
