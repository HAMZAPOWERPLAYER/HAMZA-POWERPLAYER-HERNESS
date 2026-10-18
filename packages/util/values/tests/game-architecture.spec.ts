import { describe, expect, it } from 'vitest'
import { createGameDesignSpec, recommendArchitecture } from '../src/index.ts'

type SpecParams = Parameters<typeof createGameDesignSpec>[0]
type GameDesignSpec = ReturnType<typeof createGameDesignSpec>

function buildParams(overrides: Partial<SpecParams> = {}): SpecParams {
  return {
    id: 'game-1',
    genre: 'platformer',
    platforms: ['windows'],
    capabilities: [],
    interactions: [],
    objectives: [],
    winConditions: [],
    failureConditions: [],
    progression: [],
    controls: { cameraType: 'fixed', controlScheme: 'keyboard', inputBindings: ['left', 'right'] },
    art: {
      style: 'pixel',
      palette: ['#111111'],
      lighting: 'flat',
      assetGuidance: '16-bit sprites',
    },
    audio: { music: 'chiptune', soundEffects: 'retro blips', spatialAudio: false },
    performance: {
      targetFps: null,
      targetResolution: null,
      minDeviceClass: null,
      memoryBudget: null,
    },
    accessibility: {
      colorBlind: false,
      subtitles: false,
      remappableControls: false,
      audioCues: false,
    },
    online: { onlineRequired: false, multiplayer: false, serverAuthoritative: false },
    ...overrides,
  }
}

function buildSpec(overrides: Partial<SpecParams> = {}): GameDesignSpec {
  return createGameDesignSpec(buildParams(overrides))
}

describe('recommendArchitecture', () => {
  it('selects entity-component for online-required designs', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        online: { onlineRequired: true, multiplayer: false, serverAuthoritative: true },
      }),
      complexity: 'medium',
    })
    expect(r.pattern).toBe('entity-component')
    expect(r.secondary).toEqual(['component-based', 'data-driven'])
    expect(r.rationale).toContain('online or multiplayer')
    expect(r.complexityWarning).toBeNull()
  })

  it('selects entity-component for multiplayer designs', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        online: { onlineRequired: false, multiplayer: true, serverAuthoritative: false },
      }),
      complexity: 'large',
    })
    expect(r.pattern).toBe('entity-component')
  })

  it('warns when entity-component is chosen for a small project', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        online: { onlineRequired: true, multiplayer: false, serverAuthoritative: false },
      }),
      complexity: 'small',
    })
    expect(r.pattern).toBe('entity-component')
    expect(r.complexityWarning).toBe(
      'Entity-component architecture may be over-engineered for a small project; consider scene-based or state-machine instead.',
    )
  })

  it('selects scene-based for small offline designs', () => {
    const r = recommendArchitecture({ spec: buildSpec(), complexity: 'small' })
    expect(r.pattern).toBe('scene-based')
    expect(r.secondary).toEqual(['state-machine', 'component-based'])
    expect(r.rationale).toContain('small games')
    expect(r.complexityWarning).toBeNull()
  })

  it('selects component-based for first-person camera designs', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        controls: { cameraType: 'first-person', controlScheme: 'mouse', inputBindings: [] },
      }),
      complexity: 'large',
    })
    expect(r.pattern).toBe('component-based')
    expect(r.secondary).toEqual(['event-driven', 'data-driven'])
    expect(r.rationale).toContain('Component-based')
  })

  it('selects component-based for orbit camera designs', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        controls: { cameraType: 'orbit', controlScheme: 'mouse', inputBindings: [] },
      }),
      complexity: 'medium',
    })
    expect(r.pattern).toBe('component-based')
  })

  it('selects state-machine when progression exists', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        progression: [
          { id: 'levels', description: 'Levels', milestones: ['1'], unlockConditions: [] },
        ],
      }),
      complexity: 'medium',
    })
    expect(r.pattern).toBe('state-machine')
    expect(r.secondary).toEqual(['component-based', 'data-driven'])
  })

  it('selects state-machine when more than three objectives exist', () => {
    const objectives = Array.from({ length: 4 }, (_, i) => ({
      id: `obj-${i}`,
      description: `Objective ${i}`,
      completionCondition: `Condition ${i}`,
      required: true,
    }))
    const r = recommendArchitecture({
      spec: buildSpec({ objectives }),
      complexity: 'medium',
    })
    expect(r.pattern).toBe('state-machine')
  })

  it('selects data-driven for offline designs with at most three objectives', () => {
    const objectives = Array.from({ length: 3 }, (_, i) => ({
      id: `obj-${i}`,
      description: `Objective ${i}`,
      completionCondition: `Condition ${i}`,
      required: true,
    }))
    const r = recommendArchitecture({ spec: buildSpec({ objectives }), complexity: 'medium' })
    expect(r.pattern).toBe('data-driven')
    expect(r.secondary).toEqual(['scene-based', 'component-based'])
    expect(r.rationale).toContain('configuration from logic')
  })

  it('warns when a non entity-component pattern faces very-high complexity', () => {
    const r = recommendArchitecture({ spec: buildSpec(), complexity: 'very-high' })
    expect(r.pattern).toBe('data-driven')
    expect(r.complexityWarning).toBe(
      'Consider entity-component architecture for very complex projects; the selected pattern may become difficult to maintain.',
    )
  })

  it('does not warn when very-high complexity already uses entity-component', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        online: { onlineRequired: true, multiplayer: false, serverAuthoritative: false },
      }),
      complexity: 'very-high',
    })
    expect(r.pattern).toBe('entity-component')
    expect(r.complexityWarning).toBeNull()
  })

  it('always includes input-system and ui-system for a minimal design', () => {
    const r = recommendArchitecture({ spec: buildSpec(), complexity: 'medium' })
    expect(r.boundaries.map((b) => b.id)).toEqual(['input-system', 'ui-system'])
    expect(r.contracts).toHaveLength(2)
  })

  it('adds player-system when capabilities exist and game-state-system for objectives', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        capabilities: [
          { id: 'move', description: 'Move the character', inputs: ['wasd'], dependencies: [] },
        ],
        objectives: [
          {
            id: 'reach-flag',
            description: 'Reach the flag',
            completionCondition: 'Touch the flag',
            required: true,
          },
        ],
      }),
      complexity: 'medium',
    })
    expect(r.boundaries.map((b) => b.id)).toEqual([
      'input-system',
      'player-system',
      'game-state-system',
      'ui-system',
    ])
    expect(r.contracts.map((c) => c.id)).toEqual([
      'input-contract',
      'player-contract',
      'game-state-contract',
      'ui-contract',
    ])
  })

  it('adds game-state-system for failure conditions without objectives', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        failureConditions: [
          {
            id: 'lose-all-lives',
            description: 'Lose all lives',
            check: 'lives <= 0',
            recovery: 'restart level',
          },
        ],
      }),
      complexity: 'medium',
    })
    expect(r.boundaries.map((b) => b.id)).toContain('game-state-system')
  })

  it('adds combat-system for a combat capability', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        capabilities: [
          {
            id: 'attack',
            description: 'Ranged combat attack',
            inputs: ['mouse1'],
            dependencies: [],
          },
        ],
      }),
      complexity: 'medium',
    })
    const combat = r.boundaries.find((b) => b.id === 'combat-system')
    expect(combat).toBeDefined()
    expect(combat!.dependsOn).toEqual(['player-system', 'game-state-system'])
    const combatContract = r.contracts.find((c) => c.id === 'combat-contract')
    expect(combatContract).toBeDefined()
    expect(combatContract!.operations).toEqual(['applyDamage', 'heal', 'isAlive'])
    expect(combatContract!.events).toEqual(['damageDealt', 'entityDied'])
  })

  it('adds combat-system for a defeat objective', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        objectives: [
          {
            id: 'boss',
            description: 'Defeat the final boss',
            completionCondition: 'Boss health <= 0',
            required: true,
          },
        ],
      }),
      complexity: 'medium',
    })
    expect(r.boundaries.map((b) => b.id)).toContain('combat-system')
  })

  it('keeps input-system first and ui-system last', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        capabilities: [
          { id: 'move', description: 'Move the character', inputs: ['wasd'], dependencies: [] },
        ],
        objectives: [
          {
            id: 'reach-flag',
            description: 'Reach the flag',
            completionCondition: 'Touch the flag',
            required: true,
          },
        ],
      }),
      complexity: 'medium',
    })
    expect(r.boundaries[0]!.id).toBe('input-system')
    expect(r.boundaries[r.boundaries.length - 1]!.id).toBe('ui-system')
    expect(r.boundaries[0]!.dependsOn).toEqual([])
    expect(r.boundaries[0]!.interfaces[0]!.operations).toEqual(['getAction', 'isPressed'])
  })

  it('flattens every boundary interface into the contract list', () => {
    const r = recommendArchitecture({
      spec: buildSpec({
        capabilities: [
          { id: 'move', description: 'Move the character', inputs: ['wasd'], dependencies: [] },
        ],
      }),
      complexity: 'medium',
    })
    const total = r.boundaries.reduce((sum, b) => sum + b.interfaces.length, 0)
    expect(r.contracts).toHaveLength(total)
    expect(r.contracts).toContainEqual({
      id: 'input-contract',
      name: 'Input Contract',
      description: 'Maps raw input to named actions.',
      provider: 'input-system',
      consumers: ['player-system', 'camera-system'],
      operations: ['getAction', 'isPressed'],
      events: ['actionPressed', 'actionReleased'],
    })
    expect(r.contracts).toContainEqual({
      id: 'player-contract',
      name: 'Player Contract',
      description: 'Exposes player state and movement commands.',
      provider: 'player-system',
      consumers: ['combat-system', 'camera-system', 'ui-system'],
      operations: ['move', 'interact', 'getState'],
      events: ['playerMoved', 'playerInteracted', 'playerDied'],
    })
  })
})
