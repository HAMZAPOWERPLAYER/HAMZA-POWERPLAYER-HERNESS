import { describe, expect, it } from 'vitest'
import { classifyTask, type TaskClassificationInput } from '../src/model-task-classifier.ts'

describe('classifyTask', () => {
  it('classifies general requests as general', () => {
    const input: TaskClassificationInput = { request: 'hello there' }
    const result = classifyTask(input)
    expect(result.category).toBe('general')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('classifies image inspection', () => {
    const input: TaskClassificationInput = { request: 'look at this screenshot' }
    const result = classifyTask(input)
    expect(result.category).toBe('image-inspection')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('prioritizes explicit image input', () => {
    const input: TaskClassificationInput = { request: 'write code', hasImageInput: true }
    const result = classifyTask(input)
    expect(result.category).toBe('image-inspection')
  })

  it('classifies security review', () => {
    const input: TaskClassificationInput = { request: 'review the authentication code for security vulnerabilities' }
    const result = classifyTask(input)
    expect(result.category).toBe('security-review')
  })

  it('classifies build failure analysis', () => {
    const input: TaskClassificationInput = { request: 'the build failed with a compile error' }
    const result = classifyTask(input)
    expect(result.category).toBe('build-failure-analysis')
  })

  it('classifies game engine diagnostics', () => {
    const input: TaskClassificationInput = { request: 'unity scene is broken' }
    const result = classifyTask(input)
    expect(result.category).toBe('game-engine-diagnostics')
  })

  it('classifies complex debugging', () => {
    const input: TaskClassificationInput = { request: 'debug this crash stack trace' }
    const result = classifyTask(input)
    expect(result.category).toBe('complex-debugging')
  })

  it('classifies architecture design', () => {
    const input: TaskClassificationInput = { request: 'design the system architecture' }
    const result = classifyTask(input)
    expect(result.category).toBe('architecture-design')
  })

  it('classifies test analysis', () => {
    const input: TaskClassificationInput = { request: 'analyze the flaky test coverage' }
    const result = classifyTask(input)
    expect(result.category).toBe('test-analysis')
  })

  it('classifies documentation', () => {
    const input: TaskClassificationInput = { request: 'write the readme documentation' }
    const result = classifyTask(input)
    expect(result.category).toBe('documentation')
  })

  it('classifies repository exploration', () => {
    const input: TaskClassificationInput = { request: 'explore the codebase to understand how it works' }
    const result = classifyTask(input)
    expect(result.category).toBe('repository-exploration')
  })

  it('classifies small code modification for few-file fixes', () => {
    const input: TaskClassificationInput = { request: 'fix the typo in one file', mentionedFileCount: 1 }
    const result = classifyTask(input)
    expect(result.category).toBe('small-code-modification')
  })

  it('classifies large multi-file implementation', () => {
    const input: TaskClassificationInput = { request: 'implement the feature across five files', mentionedFileCount: 6 }
    const result = classifyTask(input)
    expect(result.category).toBe('large-multi-file-implementation')
  })

  it('returns reasons and confidence', () => {
    const input: TaskClassificationInput = { request: 'screenshot analysis' }
    const result = classifyTask(input)
    expect(Array.isArray(result.reasons)).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })
})
