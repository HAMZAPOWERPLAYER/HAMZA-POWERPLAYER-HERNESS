import { describe, expect, it } from 'vitest'
import { checkDesignConsistency, createGameDesignSpec, estimateScope } from '../src/index.ts'

type SpecParams = Parameters<typeof createGameDesignSpec>[0]

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
      palette: ['#111111', '#eeeeee'],
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

function buildSpec(overrides: Partial<SpecParams> = {}) {
  return createGameDesignSpec(buildParams(overrides))
}

describe('createGameDesignSpec', () => {
  it('copies every field from the params', () => {
    const params = buildParams({
      capabilities: [
        { id: 'move', description: 'Move the character', inputs: ['wasd'], dependencies: [] },
      ],
      interactions: [
        { id: 'jump', description: 'Jump action', trigger: 'space', affects: ['move'] },
      ],
      objectives: [
        {
          id: 'reach-flag',
          description: 'Reach the flag',
          completionCondition: 'Touch the flag',
          required: true,
        },
      ],
      progression: [
        {
          id: 'worlds',
          description: 'World progression',
          milestones: ['world 1'],
          unlockConditions: ['finish world 1'],
        },
      ],
    })
    const spec = createGameDesignSpec(params)
    expect(spec).toEqual(params)
    expect(spec.id).toBe('game-1')
    expect(spec.genre).toBe('platformer')
    expect(spec.controls.cameraType).toBe('fixed')
    expect(spec.audio.spatialAudio).toBe(false)
  })

  it('keeps empty collections as provided', () => {
    const spec = buildSpec()
    expect(spec.capabilities).toHaveLength(0)
    expect(spec.interactions).toHaveLength(0)
    expect(spec.objectives).toHaveLength(0)
    expect(spec.winConditions).toHaveLength(0)
    expect(spec.failureConditions).toHaveLength(0)
    expect(spec.progression).toHaveLength(0)
    expect(spec.platforms).toEqual(['windows'])
  })
})

describe('estimateScope', () => {
  it('estimates an empty design as small with a primary-goal MVP', () => {
    const e = estimateScope(buildSpec())
    expect(e.complexity).toBe('small')
    expect(e.effort).toBe('low')
    expect(e.factors).toEqual([])
    expect(e.defer).toEqual([])
    expect(e.mvp).toBe('Single-level platformer with core mechanic and one primary goal.')
  })

  it('estimates four weighted items as medium', () => {
    const e = estimateScope(
      buildSpec({
        capabilities: [
          { id: 'a', description: 'A', inputs: [], dependencies: [] },
          { id: 'b', description: 'B', inputs: [], dependencies: [] },
          { id: 'c', description: 'C', inputs: [], dependencies: [] },
          { id: 'd', description: 'D', inputs: [], dependencies: [] },
        ],
      }),
    )
    expect(e.complexity).toBe('medium')
    expect(e.effort).toBe('medium')
    expect(e.mvp).toBe('Multi-level platformer with 4 capabilities and 0 objectives.')
  })

  it('estimates eight weighted items as large', () => {
    const e = estimateScope(
      buildSpec({
        capabilities: Array.from({ length: 8 }, (_, i) => ({
          id: `cap-${i}`,
          description: `Capability ${i}`,
          inputs: [],
          dependencies: [],
        })),
      }),
    )
    expect(e.complexity).toBe('large')
    expect(e.effort).toBe('high')
    expect(e.mvp).toBe('Full platformer with progression, 8 capabilities, and 0 objectives.')
    expect(e.defer).toEqual([])
  })

  it('estimates nine capabilities plus online play as epic', () => {
    const e = estimateScope(
      buildSpec({
        capabilities: Array.from({ length: 9 }, (_, i) => ({
          id: `cap-${i}`,
          description: `Capability ${i}`,
          inputs: [],
          dependencies: [],
        })),
        online: { onlineRequired: false, multiplayer: true, serverAuthoritative: false },
      }),
    )
    expect(e.complexity).toBe('epic')
    expect(e.effort).toBe('very-high')
    expect(e.factors).toEqual(['online or multiplayer networking'])
    expect(e.mvp).toBe(
      'Full platformer with 9 capabilities, 0 objectives, 0 progression systems, and online features.',
    )
    expect(e.defer).toEqual([])
  })

  it('lists every contributing factor in evaluation order', () => {
    const e = estimateScope(
      buildSpec({
        capabilities: [
          { id: 'move', description: 'Move', inputs: [], dependencies: [] },
          { id: 'shoot', description: 'Shoot', inputs: [], dependencies: [] },
        ],
        interactions: [
          { id: 'fire', description: 'Fire', trigger: 'mouse1', affects: ['shoot'] },
        ],
        objectives: [
          {
            id: 'survive',
            description: 'Survive',
            completionCondition: 'Stay alive',
            required: true,
          },
        ],
        progression: [
          { id: 'levels', description: 'Levels', milestones: ['1'], unlockConditions: [] },
        ],
        controls: { cameraType: 'first-person', controlScheme: 'mouse+kb', inputBindings: [] },
        performance: {
          targetFps: 60,
          targetResolution: null,
          minDeviceClass: null,
          memoryBudget: null,
        },
        accessibility: {
          colorBlind: true,
          subtitles: false,
          remappableControls: false,
          audioCues: false,
        },
        online: { onlineRequired: false, multiplayer: true, serverAuthoritative: false },
      }),
    )
    expect(e.complexity).toBe('large')
    expect(e.factors).toEqual([
      'online or multiplayer networking',
      '3D camera system',
      'high frame rate target',
      'accessibility features',
    ])
  })

  it('ignores null and sub-60 frame targets', () => {
    const e = estimateScope(
      buildSpec({
        performance: {
          targetFps: 30,
          targetResolution: null,
          minDeviceClass: null,
          memoryBudget: null,
        },
      }),
    )
    expect(e.factors).toEqual([])
    expect(estimateScope(buildSpec()).factors).toEqual([])
  })

  it('treats an orbit camera as a 3D camera system', () => {
    const e = estimateScope(
      buildSpec({
        controls: { cameraType: 'orbit', controlScheme: 'mouse', inputBindings: [] },
      }),
    )
    expect(e.factors).toContain('3D camera system')
  })

  it('counts subtitles alone as an accessibility factor', () => {
    const e = estimateScope(
      buildSpec({
        accessibility: {
          colorBlind: false,
          subtitles: true,
          remappableControls: false,
          audioCues: false,
        },
      }),
    )
    expect(e.factors).toContain('accessibility features')
  })

  it('does not count remappable controls or audio cues alone', () => {
    const e = estimateScope(
      buildSpec({
        accessibility: {
          colorBlind: false,
          subtitles: false,
          remappableControls: true,
          audioCues: true,
        },
      }),
    )
    expect(e.factors).toEqual([])
  })

  it('uses the first capability and lowercased first objective in the small MVP', () => {
    const e = estimateScope(
      buildSpec({
        capabilities: [
          { id: 'move', description: 'Move the character', inputs: [], dependencies: [] },
        ],
        objectives: [
          {
            id: 'coins',
            description: 'Collect Ten Coins',
            completionCondition: 'Collect 10 coins',
            required: true,
          },
        ],
      }),
    )
    expect(e.complexity).toBe('small')
    expect(e.mvp).toBe(
      'Single-level platformer with Move the character and one collect ten coins.',
    )
  })

  it('defers online multiplayer on small designs', () => {
    const e = estimateScope(
      buildSpec({ online: { onlineRequired: true, multiplayer: false, serverAuthoritative: false } }),
    )
    expect(e.complexity).toBe('small')
    expect(e.defer).toEqual(['online multiplayer'])
  })

  it('defers advanced progression beyond two systems on small designs', () => {
    const e = estimateScope(
      buildSpec({
        progression: [
          { id: 'p1', description: 'P1', milestones: [], unlockConditions: [] },
          { id: 'p2', description: 'P2', milestones: [], unlockConditions: [] },
          { id: 'p3', description: 'P3', milestones: [], unlockConditions: [] },
        ],
      }),
    )
    expect(e.complexity).toBe('small')
    expect(e.defer).toEqual(['advanced progression systems'])
  })

  it('defers 3D camera polish and accessibility on small designs', () => {
    const e = estimateScope(
      buildSpec({
        controls: { cameraType: 'first-person', controlScheme: 'mouse', inputBindings: [] },
        accessibility: {
          colorBlind: true,
          subtitles: false,
          remappableControls: false,
          audioCues: false,
        },
      }),
    )
    expect(e.complexity).toBe('small')
    expect(e.defer).toEqual(['3D camera polish', 'advanced accessibility features'])
  })

  it('defers online multiplayer through medium complexity', () => {
    const e = estimateScope(
      buildSpec({
        capabilities: [
          { id: 'a', description: 'A', inputs: [], dependencies: [] },
          { id: 'b', description: 'B', inputs: [], dependencies: [] },
          { id: 'c', description: 'C', inputs: [], dependencies: [] },
          { id: 'd', description: 'D', inputs: [], dependencies: [] },
        ],
        online: { onlineRequired: true, multiplayer: false, serverAuthoritative: false },
      }),
    )
    expect(e.complexity).toBe('medium')
    expect(e.defer).toEqual(['online multiplayer'])
  })
})

describe('checkDesignConsistency', () => {
  it('reports an empty design as consistent with no issues', () => {
    const c = checkDesignConsistency(buildSpec())
    expect(c.consistent).toBe(true)
    expect(c.issues).toEqual([])
  })

  it('accepts interactions that affect known capabilities', () => {
    const c = checkDesignConsistency(
      buildSpec({
        capabilities: [
          { id: 'move', description: 'Move', inputs: [], dependencies: [] },
        ],
        interactions: [
          { id: 'jump', description: 'Jump', trigger: 'space', affects: ['move'] },
        ],
      }),
    )
    expect(c.consistent).toBe(true)
    expect(c.issues).toEqual([])
  })

  it('warns when an interaction affects an unknown capability', () => {
    const c = checkDesignConsistency(
      buildSpec({
        interactions: [
          { id: 'attack', description: 'Attack', trigger: 'mouse1', affects: ['fly'] },
        ],
      }),
    )
    expect(c.consistent).toBe(true)
    expect(c.issues).toHaveLength(1)
    expect(c.issues[0]).toEqual({
      severity: 'warning',
      message: "Interaction 'attack' affects unknown capability 'fly'.",
      entityId: 'attack',
      suggestion: "Add capability 'fly' or remove it from interaction affects.",
    })
  })

  it('collects one warning per unknown reference', () => {
    const c = checkDesignConsistency(
      buildSpec({
        interactions: [
          { id: 'attack', description: 'Attack', trigger: 'mouse1', affects: ['fly', 'swim'] },
        ],
      }),
    )
    expect(c.issues).toHaveLength(2)
    expect(c.issues.map((i) => i.entityId)).toEqual(['attack', 'attack'])
    expect(c.consistent).toBe(true)
  })

  it('does not require objective ids to match interaction ids', () => {
    const c = checkDesignConsistency(
      buildSpec({
        objectives: [
          {
            id: 'score-100',
            description: 'Score 100 points',
            completionCondition: 'Score >= 100',
            required: true,
          },
        ],
        interactions: [
          { id: 'jump', description: 'Jump', trigger: 'space', affects: [] },
        ],
      }),
    )
    expect(c.issues).toEqual([])
    expect(c.consistent).toBe(true)
  })
})
