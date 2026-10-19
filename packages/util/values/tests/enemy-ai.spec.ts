import { describe, expect, it } from 'vitest'
import type { AIConfig, AIState, AIStateInstance } from '../src/index.ts'
import {
  DEFAULT_AI_CONFIG,
  createAIState,
  updateAI,
  validateAIConfig,
} from '../src/index.ts'

function makeState(overrides: Partial<AIStateInstance> = {}): AIStateInstance {
  return {
    state: 'idle',
    timeInState: 0,
    timeSinceLastAttack: DEFAULT_AI_CONFIG.attackCooldown,
    stunned: false,
    targetPosition: null,
    patrolIndex: 0,
    patrolWaypoints: [],
    ...overrides,
  }
}

describe('createAIState', () => {
  it('starts idle with a ready attack cooldown', () => {
    const s = createAIState(DEFAULT_AI_CONFIG)
    expect(s.state).toBe('idle')
    expect(s.timeInState).toBe(0)
    expect(s.timeSinceLastAttack).toBe(DEFAULT_AI_CONFIG.attackCooldown)
    expect(s.stunned).toBe(false)
    expect(s.targetPosition).toBeNull()
    expect(s.patrolIndex).toBe(0)
    expect(s.patrolWaypoints).toEqual([])
  })

  it('seeds the attack timer from the supplied config', () => {
    const config: AIConfig = { ...DEFAULT_AI_CONFIG, attackCooldown: 3 }
    expect(createAIState(config).timeSinceLastAttack).toBe(3)
  })
})

describe('updateAI', () => {
  it('throws when the current state is missing from the config', () => {
    const config: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      states: [{ id: 'idle', name: 'Idle', canAttack: false, canChase: false, canPatrol: false }],
    }
    expect(() =>
      updateAI(makeState({ state: 'chase' }), config, 0.1, null, [0, 0, 0], false),
    ).toThrow(/unknown AI state: chase/)
  })

  it('advances time by the delta and reports no change', () => {
    const r = updateAI(makeState(), DEFAULT_AI_CONFIG, 0.05, null, [0, 0, 0], false)
    expect(r.state.timeInState).toBe(0.05)
    expect(r.state.timeSinceLastAttack).toBeGreaterThan(DEFAULT_AI_CONFIG.attackCooldown)
    expect(r.state.state).toBe('idle')
    expect(r.stateChanged).toBe(false)
    expect(r.previousState).toBeNull()
    expect(r.attacked).toBe(false)
    expect(r.newTarget).toBeNull()
  })

  it('clamps a huge delta to 0.1 seconds', () => {
    const r = updateAI(makeState(), DEFAULT_AI_CONFIG, 5, null, [0, 0, 0], false)
    expect(r.state.timeInState).toBe(0.1)
  })

  it('treats a negative delta as zero', () => {
    const r = updateAI(makeState(), DEFAULT_AI_CONFIG, -1, null, [0, 0, 0], false)
    expect(r.state.timeInState).toBe(0)
    expect(r.state.timeSinceLastAttack).toBe(DEFAULT_AI_CONFIG.attackCooldown)
  })

  it('dead enemies stay dead and ignore the player', () => {
    const state = makeState({ state: 'dead', timeInState: 2, targetPosition: [7, 0, 0] })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, [0, 0, 0], [1, 0, 0], true)
    expect(r.state.state).toBe('dead')
    expect(r.state.timeInState).toBeGreaterThan(2)
    expect(r.stateChanged).toBe(false)
    expect(r.attacked).toBe(false)
    expect(r.previousState).toBeNull()
    expect(r.newTarget).toBeNull()
    expect(r.state.targetPosition).toEqual([7, 0, 0])
  })

  it('patrol to chase when the player is seen beyond attack range', () => {
    const state = makeState({
      state: 'patrol',
      timeInState: 1,
      patrolWaypoints: [[0, 0, 0], [5, 0, 5]],
      patrolIndex: 0,
    })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, [10, 0, 0], [0, 0, 0], true)
    expect(r.state.state).toBe('chase')
    expect(r.stateChanged).toBe(true)
    expect(r.previousState).toBe('patrol')
    expect(r.state.timeInState).toBe(0)
    expect(r.newTarget).toEqual([10, 0, 0])
    expect(r.state.targetPosition).toEqual([10, 0, 0])
  })

  it('chase to attack in range attacks when the cooldown is ready', () => {
    const state = makeState({ state: 'chase', timeSinceLastAttack: 1.5 })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, [1, 0, 0], [0, 0, 0], true)
    expect(r.state.state).toBe('attack')
    expect(r.stateChanged).toBe(true)
    expect(r.previousState).toBe('chase')
    expect(r.attacked).toBe(true)
    expect(r.state.timeSinceLastAttack).toBe(0)
  })

  it('does not attack before the cooldown expires', () => {
    const state = makeState({ state: 'attack', timeSinceLastAttack: 0.5 })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, [1, 0, 0], [0, 0, 0], true)
    expect(r.state.state).toBe('attack')
    expect(r.attacked).toBe(false)
    expect(r.stateChanged).toBe(false)
    expect(r.state.timeSinceLastAttack).toBeGreaterThan(0.5)
  })

  it('attack to chase once the cooldown passes without the player', () => {
    const state = makeState({ state: 'attack', timeSinceLastAttack: 1.45 })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
    expect(r.state.state).toBe('chase')
    expect(r.stateChanged).toBe(true)
    expect(r.previousState).toBe('attack')
    expect(r.attacked).toBe(false)
  })

  it('retreats from attack when the player is beyond twice the attack range', () => {
    const state = makeState({ state: 'attack', timeSinceLastAttack: 0.5 })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, [5, 0, 0], [0, 0, 0], false)
    expect(r.state.state).toBe('retreat')
    expect(r.stateChanged).toBe(true)
    expect(r.previousState).toBe('attack')
  })

  it('returns to patrol after losing the player for over three seconds', () => {
    const state = makeState({
      state: 'chase',
      timeInState: 3.05,
      patrolWaypoints: [[0, 0, 0], [4, 0, 4]],
      patrolIndex: 0,
    })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
    expect(r.state.state).toBe('patrol')
    expect(r.stateChanged).toBe(true)
    expect(r.previousState).toBe('chase')
    expect(r.state.timeInState).toBe(0)
    expect(r.state.patrolIndex).toBe(1)
    expect(r.newTarget).toEqual([4, 0, 4])
  })

  it('stays in chase before the lost-player timeout', () => {
    const state = makeState({ state: 'chase', timeInState: 1 })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
    expect(r.state.state).toBe('chase')
    expect(r.stateChanged).toBe(false)
  })

  it('cycles patrol waypoints every patrol frame', () => {
    const waypoints: [number, number, number][] = [[0, 0, 0], [1, 0, 1], [2, 0, 2]]
    let state = makeState({ state: 'patrol', patrolWaypoints: waypoints, patrolIndex: 0 })
    const r1 = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
    expect(r1.state.patrolIndex).toBe(1)
    expect(r1.newTarget).toEqual([1, 0, 1])
    state = r1.state
    const r2 = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
    expect(r2.state.patrolIndex).toBe(2)
    expect(r2.newTarget).toEqual([2, 0, 2])
    state = r2.state
    const r3 = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
    expect(r3.state.patrolIndex).toBe(0)
    expect(r3.newTarget).toEqual([0, 0, 0])
  })

  it('chases only when both sight and a position are available', () => {
    const r = updateAI(makeState(), DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], true)
    expect(r.state.state).toBe('idle')
    expect(r.stateChanged).toBe(false)
    expect(r.state.targetPosition).toBeNull()
  })

  it('measures distance on every axis', () => {
    const near = updateAI(makeState({ state: 'chase' }), DEFAULT_AI_CONFIG, 0.1, [0, 1.5, 0], [0, 0, 0], true)
    expect(near.state.state).toBe('attack')
    const high = updateAI(makeState({ state: 'chase' }), DEFAULT_AI_CONFIG, 0.1, [0, 4, 0], [0, 0, 0], true)
    expect(high.state.state).toBe('chase')
    expect(high.stateChanged).toBe(false)
  })

  it('does not bypass the configured transitions', () => {
    const r = updateAI(makeState(), DEFAULT_AI_CONFIG, 0.1, [1, 0, 0], [0, 0, 0], true)
    expect(r.state.state).toBe('idle')
    expect(r.stateChanged).toBe(false)
    expect(r.previousState).toBeNull()
  })

  it('advances stun time at the real-time rate', () => {
    const state = makeState({ state: 'stun', stunned: true, timeInState: 0.5 })
    const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
    const advanced = r.state.timeInState - state.timeInState
    expect(Math.abs(advanced - 0.1) < 1e-9).toBe(true)
    expect(r.state.stunned).toBe(true)
    expect(r.state.state).toBe('stun')
  })

  it('recovers from stun only after the configured stun duration', () => {
    let state = makeState({ state: 'stun', stunned: true })
    for (let i = 0; i < 19; i++) {
      state = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false).state
      expect(state.stunned).toBe(true)
      expect(state.state).toBe('stun')
    }
    let recovered = false
    for (let i = 0; i < 20 && state.stunned; i++) {
      const r = updateAI(state, DEFAULT_AI_CONFIG, 0.1, null, [0, 0, 0], false)
      state = r.state
      if (!state.stunned) {
        recovered = true
        expect(r.stateChanged).toBe(true)
        expect(r.previousState).toBe('stun')
      }
    }
    expect(recovered).toBe(true)
    expect(state.stunned).toBe(false)
    expect(state.state).toBe('idle')
    expect(state.timeInState).toBe(0)
  })
})

describe('validateAIConfig', () => {
  it('accepts the default configuration', () => {
    expect(validateAIConfig(DEFAULT_AI_CONFIG)).toEqual([])
  })

  it('rejects an empty state list', () => {
    const config: AIConfig = { ...DEFAULT_AI_CONFIG, states: [], transitions: [] }
    expect(validateAIConfig(config)).toEqual([
      'at least one state is required',
      'at least one idle state is recommended',
    ])
  })

  it('flags non-positive ranges', () => {
    const config: AIConfig = { ...DEFAULT_AI_CONFIG, detectionRange: 0, attackRange: -1 }
    expect(validateAIConfig(config)).toEqual([
      'detectionRange must be positive',
      'attackRange must be positive',
    ])
  })

  it('flags non-positive speeds, cooldown, and stun duration', () => {
    const config: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      patrolSpeed: 0,
      chaseSpeed: -1,
      retreatSpeed: 0,
      attackCooldown: 0,
      stunDuration: -2,
    }
    expect(validateAIConfig(config)).toEqual([
      'patrolSpeed must be positive',
      'chaseSpeed must be positive',
      'retreatSpeed must be positive',
      'attackCooldown must be positive',
      'stunDuration must be positive',
    ])
  })

  it('flags transitions referencing unknown states', () => {
    const toUnknown: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      transitions: [{ from: 'idle', to: 'fly' as AIState, condition: 'test', minTime: 0 }],
    }
    expect(validateAIConfig(toUnknown)).toEqual(["transition to unknown state 'fly'"])
    const fromUnknown: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      transitions: [{ from: 'ghost' as AIState, to: 'idle', condition: 'test', minTime: 0 }],
    }
    expect(validateAIConfig(fromUnknown)).toEqual(["transition from unknown state 'ghost'"])
  })

  it('flags a negative transition minTime', () => {
    const config: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      transitions: [{ from: 'idle', to: 'patrol', condition: 'test', minTime: -1 }],
    }
    expect(validateAIConfig(config)).toEqual(['transition minTime must be non-negative'])
  })

  it('recommends an idle state', () => {
    const config: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      states: [{ id: 'chase', name: 'Chase', canAttack: true, canChase: true, canPatrol: false }],
      transitions: [],
    }
    expect(validateAIConfig(config)).toEqual(['at least one idle state is recommended'])
  })
})
