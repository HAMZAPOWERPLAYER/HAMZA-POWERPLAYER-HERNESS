import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { routeGameRequest } from '../src/game-request-router.ts'

const srcDir = fileURLToPath(new URL('../src/', import.meta.url))

/** Every module basename the router can recommend; each must exist under `src/`. */
const ALL_RECOMMENDABLE_MODULES: readonly string[] = [
  'player-movement.ts',
  'enemy-ai.ts',
  'interaction-puzzle.ts',
  'mobile-optimization.ts',
  'game-design-tasks.ts',
  'vertical-slice.ts',
  'horror-game.ts',
  'game-ui.ts',
  'game-audio.ts',
  'animation-system.ts',
  'asset-pipeline.ts',
  'game-performance.ts',
  'game-performance-triage.ts',
  'game-testing.ts',
  'game-quality-gate.ts',
  'game-integration-review.ts',
  'game-reliability.ts',
  'android-gradle-model.ts',
  'godot-export-presets.ts',
  'godot-diagnostics.ts',
  'unity-diagnostics.ts',
]

describe('routeGameRequest', () => {
  it('routes "Create a player movement system" to the movement module', () => {
    const route = routeGameRequest({ request: 'Create a player movement system' })
    expect(route.capabilities).toEqual(['player-movement'])
    expect(route.recommendedModules).toEqual(['player-movement.ts'])
    expect(route.clarifications).toEqual([])
    expect(route.confidence).toBe('high')
  })

  it('routes "Fix broken interactions" to the interaction module', () => {
    const route = routeGameRequest({ request: 'Fix broken interactions' })
    expect(route.capabilities).toEqual(['interaction'])
    expect(route.recommendedModules).toEqual(['interaction-puzzle.ts'])
    expect(route.clarifications).toEqual([])
    expect(route.confidence).toBe('high')
  })

  it('routes "Add enemy AI" to the enemy AI module', () => {
    const route = routeGameRequest({ request: 'Add enemy AI' })
    expect(route.capabilities).toEqual(['enemy-ai'])
    expect(route.recommendedModules).toEqual(['enemy-ai.ts'])
    expect(route.clarifications).toEqual([])
    expect(route.confidence).toBe('high')
  })

  it('routes "Improve mobile performance" to the mobile optimization module', () => {
    const route = routeGameRequest({ request: 'Improve mobile performance' })
    expect(route.capabilities).toEqual(['mobile-performance', 'game-performance'])
    expect(route.recommendedModules).toEqual(['mobile-optimization.ts', 'game-performance.ts', 'game-performance-triage.ts'])
    expect(route.clarifications).toEqual([])
    expect(route.confidence).toBe('high')
  })

  it('routes "Implement a save system" to the save task derivation module', () => {
    const route = routeGameRequest({ request: 'Implement a save system' })
    expect(route.capabilities).toEqual(['save-system'])
    expect(route.recommendedModules).toEqual(['game-design-tasks.ts'])
    expect(route.clarifications).toEqual([])
    expect(route.confidence).toBe('high')
  })

  it('routes "Build a playable prototype" to the vertical slice module', () => {
    const route = routeGameRequest({ request: 'Build a playable prototype' })
    expect(route.capabilities).toEqual(['playable-prototype'])
    expect(route.recommendedModules).toEqual(['vertical-slice.ts'])
    expect(route.clarifications).toEqual([])
    expect(route.confidence).toBe('high')
  })

  it('tolerates case, whitespace, and punctuation', () => {
    const plain = routeGameRequest({ request: 'create a player movement system' })
    const noisy = routeGameRequest({ request: '  CREATE   A   PLAYER   MOVEMENT   System! ' })
    const hyphenated = routeGameRequest({ request: 'Fix-Broken INTERACTIONS.' })
    expect(noisy).toEqual(plain)
    expect(hyphenated.capabilities).toEqual(['interaction'])
    expect(hyphenated.recommendedModules).toEqual(['interaction-puzzle.ts'])
  })

  it('returns no invented capabilities for an unknown request', () => {
    const route = routeGameRequest({ request: 'Refactor the invoice pdf parser' })
    expect(route.capabilities).toEqual([])
    expect(route.recommendedModules).toEqual([])
    expect(route.confidence).toBe('low')
    expect(route.clarifications.length).toBeGreaterThan(0)
  })

  it('asks which engine the project uses when it is missing for an export fix', () => {
    const route = routeGameRequest({ request: 'fix android export errors' })
    expect(route.capabilities).toEqual(['export-build'])
    expect(route.recommendedModules).toContain('android-gradle-model.ts')
    expect(route.confidence).toBe('medium')
    expect(route.clarifications.some((line) => line.includes('engine'))).toBe(true)
  })

  it('adds engine-specific export modules when the engine is known', () => {
    const route = routeGameRequest({ request: 'fix android export errors', project: { engine: 'godot' } })
    expect(route.capabilities).toEqual(['export-build'])
    expect(route.recommendedModules).toEqual(['android-gradle-model.ts', 'godot-export-presets.ts', 'godot-diagnostics.ts'])
    expect(route.clarifications).toEqual([])
    expect(route.confidence).toBe('high')
  })

  it('routes an engine-named export request without an android mention', () => {
    const route = routeGameRequest({ request: 'the export preset fails', project: { engine: 'godot' } })
    expect(route.capabilities).toEqual(['export-build'])
    expect(route.recommendedModules).toEqual(['godot-export-presets.ts', 'godot-diagnostics.ts'])
    expect(route.confidence).toBe('high')
  })

  it('is deterministic across repeated and interleaved calls', () => {
    const first = routeGameRequest({ request: 'Add enemy AI' })
    const other = routeGameRequest({ request: 'Improve mobile performance' })
    const repeated = routeGameRequest({ request: 'Add enemy AI' })
    expect(repeated).toEqual(first)
    expect(first.capabilities).toEqual(['enemy-ai'])
    expect(other.capabilities).toEqual(['mobile-performance', 'game-performance'])
  })

  it('does not change its input', () => {
    const input = { request: 'Implement a save system', project: { engine: 'godot', complexity: 'large' } }
    const snapshot = JSON.parse(JSON.stringify(input))
    routeGameRequest(input)
    expect(input).toEqual(snapshot)
  })

  it('recommends only modules that exist under src/', () => {
    for (const module of ALL_RECOMMENDABLE_MODULES) {
      expect(existsSync(`${srcDir}${module}`), module).toBe(true)
    }
  })
})
