import { describe, expect, it } from 'vitest'
import type { MovementConfig, MovementInput, MovementPreset, MovementState } from '../src/index.ts'
import {
  DEFAULT_MOVEMENT_CONFIG,
  MOVEMENT_PRESETS,
  resolveMovementConfig,
  updateMovement,
  validateMovementConfig,
} from '../src/index.ts'

const DT = 0.016

const PRESETS: readonly MovementPreset[] = ['first-person', 'third-person', 'top-down', 'platformer']

function makeState(overrides: Partial<MovementState> = {}): MovementState {
  return {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    facing: [0, 0, 1],
    grounded: true,
    sprinting: false,
    crouching: false,
    speedMultiplier: 1,
    ...overrides,
  }
}

function makeInput(overrides: Partial<MovementInput> = {}): MovementInput {
  return {
    forward: 0,
    strafe: 0,
    jumpPressed: false,
    sprint: false,
    crouch: false,
    ...overrides,
  }
}

function horizontalSpeed(state: MovementState): number {
  return Math.sqrt(state.velocity[0] ** 2 + state.velocity[2] ** 2)
}

describe('updateMovement', () => {
  it('moves the character forward on the ground', () => {
    const r = updateMovement(makeState(), makeInput({ forward: 1 }), DEFAULT_MOVEMENT_CONFIG, DT)
    expect(r.state.position[2]).toBeGreaterThan(0)
    expect(r.state.position[0]).toBe(0)
    expect(r.state.position[1]).toBe(0)
    expect(r.state.velocity[1]).toBe(0)
    expect(r.state.facing).toEqual([0, 0, 1])
    expect(r.state.grounded).toBe(true)
    expect(r.grounded).toBe(true)
    expect(r.jumped).toBe(false)
    expect(r.wallCollision).toBe(false)
  })

  it('sprint and crouch scale the movement speed', () => {
    const walk = updateMovement(makeState(), makeInput({ forward: 1 }), DEFAULT_MOVEMENT_CONFIG, DT)
    const sprint = updateMovement(
      makeState(),
      makeInput({ forward: 1, sprint: true }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
    )
    const crouch = updateMovement(
      makeState(),
      makeInput({ forward: 1, crouch: true }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
    )
    expect(walk.state.speedMultiplier).toBe(1)
    expect(sprint.state.speedMultiplier).toBe(1.5)
    expect(sprint.state.sprinting).toBe(true)
    expect(crouch.state.speedMultiplier).toBe(0.5)
    expect(crouch.state.crouching).toBe(true)
    expect(sprint.state.position[2]).toBeGreaterThan(walk.state.position[2])
    expect(walk.state.position[2]).toBeGreaterThan(crouch.state.position[2])
  })

  it('crouch loses to sprint when both are held', () => {
    const r = updateMovement(
      makeState(),
      makeInput({ forward: 1, sprint: true, crouch: true }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
    )
    expect(r.state.speedMultiplier).toBe(1.5)
  })

  it('normalizes diagonal input so speed is not multiplied', () => {
    const r = updateMovement(
      makeState(),
      makeInput({ forward: 1, strafe: 1 }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
    )
    const speed = horizontalSpeed(r.state)
    expect(speed <= DEFAULT_MOVEMENT_CONFIG.baseSpeed).toBe(true)
    expect(speed).toBeGreaterThan(0)
    expect(r.state.velocity[0] < 0).toBe(true)
    expect(r.state.velocity[2] > 0).toBe(true)
  })

  it('ground speed never exceeds maxGroundSpeed across repeated steps', () => {
    let state = makeState()
    for (let i = 0; i < 30; i++) {
      const r = updateMovement(
        state,
        makeInput({ forward: 1, strafe: 1, sprint: true }),
        DEFAULT_MOVEMENT_CONFIG,
        DT,
      )
      state = r.state
      expect(horizontalSpeed(state) <= DEFAULT_MOVEMENT_CONFIG.maxGroundSpeed).toBe(true)
      expect(state.grounded).toBe(true)
    }
  })

  it('caps the target speed at maxGroundSpeed', () => {
    const config: MovementConfig = {
      ...DEFAULT_MOVEMENT_CONFIG,
      baseSpeed: 50,
      sprintMultiplier: 1,
      groundFriction: 0,
    }
    const r = updateMovement(makeState(), makeInput({ forward: 1 }), config, DT)
    expect(horizontalSpeed(r.state)).toBe(config.maxGroundSpeed)
  })

  it('gravity accelerates the character downward while airborne', () => {
    let state = makeState({ position: [0, 20, 0], grounded: false })
    let previousVelY = state.velocity[1]
    for (let i = 0; i < 10; i++) {
      const r = updateMovement(state, makeInput(), DEFAULT_MOVEMENT_CONFIG, DT)
      state = r.state
      expect(previousVelY - state.velocity[1]).toBeGreaterThan(0)
      expect(r.grounded).toBe(false)
      previousVelY = state.velocity[1]
    }
    expect(state.position[1] < 20).toBe(true)
  })

  it('does not jump without ground contact', () => {
    const r = updateMovement(
      makeState({ position: [0, 10, 0], grounded: false }),
      makeInput({ jumpPressed: true }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
    )
    expect(r.jumped).toBe(false)
    expect(r.state.grounded).toBe(false)
    expect(r.state.velocity[1] < 0).toBe(true)
  })

  it('jumps when grounded and reports the jump', () => {
    const r = updateMovement(
      makeState(),
      makeInput({ jumpPressed: true }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
    )
    expect(r.jumped).toBe(true)
    expect(r.state.velocity[1]).toBe(DEFAULT_MOVEMENT_CONFIG.jumpImpulse)
    expect(r.state.grounded).toBe(false)
    expect(r.grounded).toBe(false)
    expect(r.state.position[1]).toBeGreaterThan(0)
  })

  it('lands back on the ground plane and zeroes vertical velocity', () => {
    let state = makeState({ position: [0, 0.5, 0], velocity: [0, -1, 0], grounded: false })
    let steps = 0
    while (!state.grounded && steps < 50) {
      state = updateMovement(state, makeInput(), DEFAULT_MOVEMENT_CONFIG, DT).state
      steps++
    }
    expect(state.grounded).toBe(true)
    expect(state.position[1]).toBe(0)
    expect(state.velocity[1]).toBe(0)
  })

  it('clamps a huge delta time to 0.1 seconds', () => {
    const r = updateMovement(
      makeState({ position: [0, 20, 0], grounded: false }),
      makeInput(),
      DEFAULT_MOVEMENT_CONFIG,
      5,
    )
    expect(r.state.velocity[1]).toBe(DEFAULT_MOVEMENT_CONFIG.gravity * 0.1)
  })

  it('treats a negative delta time as zero', () => {
    const r = updateMovement(
      makeState({ position: [0, 20, 0], velocity: [0, -3, 0], grounded: false }),
      makeInput(),
      DEFAULT_MOVEMENT_CONFIG,
      -1,
    )
    expect(r.state.velocity[1]).toBe(-3)
    expect(r.state.position[1]).toBe(20)
    expect(r.grounded).toBe(false)
  })

  it('faces the strafe direction when strafing', () => {
    const r = updateMovement(makeState(), makeInput({ strafe: 1 }), DEFAULT_MOVEMENT_CONFIG, DT)
    expect(r.state.facing).toEqual([-1, 0, 0])
    expect(r.state.position[0] < 0).toBe(true)
    expect(r.state.position[2]).toBe(0)
  })

  it('keeps facing and position without movement input', () => {
    const r = updateMovement(makeState(), makeInput(), DEFAULT_MOVEMENT_CONFIG, DT)
    expect(r.state.facing).toEqual([0, 0, 1])
    expect(r.state.position).toEqual([0, 0, 0])
    expect(horizontalSpeed(r.state)).toBe(0)
  })

  it('clamps horizontal speed to maxAirSpeed while airborne', () => {
    const config: MovementConfig = {
      ...DEFAULT_MOVEMENT_CONFIG,
      baseSpeed: 20,
      maxGroundSpeed: 30,
    }
    const r = updateMovement(
      makeState({ position: [0, 10, 0], grounded: false }),
      makeInput({ forward: 1 }),
      config,
      DT,
    )
    const speed = horizontalSpeed(r.state)
    expect(speed <= config.maxAirSpeed).toBe(true)
    expect(speed).toBeGreaterThan(DEFAULT_MOVEMENT_CONFIG.baseSpeed)
    expect(r.grounded).toBe(false)
  })

  it('returns the input state unchanged while paused', () => {
    const state = makeState({
      position: [3, 0, -2],
      velocity: [1.5, 0, 2.25],
      speedMultiplier: 1.5,
      sprinting: true,
    })
    const r = updateMovement(
      state,
      makeInput({ forward: 1, strafe: 0.5, jumpPressed: true, sprint: true }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
      { paused: true },
    )
    expect(r.state).toEqual(state)
    expect(r.state).toBe(state)
    expect(r.state.velocity).toEqual([1.5, 0, 2.25])
    expect(r.jumped).toBe(false)
    expect(r.wallCollision).toBe(false)
    expect(r.grounded).toBe(true)
  })

  it('preserves an airborne state while paused', () => {
    const state = makeState({ position: [0, 10, 0], velocity: [0, -4, 0], grounded: false })
    const r = updateMovement(
      state,
      makeInput({ jumpPressed: true }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
      { paused: true },
    )
    expect(r.state).toEqual(state)
    expect(r.grounded).toBe(false)
    expect(r.jumped).toBe(false)
    expect(r.wallCollision).toBe(false)
  })

  it('simulates normally when options omit or disable paused', () => {
    const expected = updateMovement(makeState(), makeInput({ forward: 1 }), DEFAULT_MOVEMENT_CONFIG, DT)
    const emptyOptions = updateMovement(makeState(), makeInput({ forward: 1 }), DEFAULT_MOVEMENT_CONFIG, DT, {})
    const pausedFalse = updateMovement(
      makeState(),
      makeInput({ forward: 1 }),
      DEFAULT_MOVEMENT_CONFIG,
      DT,
      { paused: false },
    )
    expect(emptyOptions).toEqual(expected)
    expect(pausedFalse).toEqual(expected)
  })
})

describe('validateMovementConfig', () => {
  it('accepts the default configuration', () => {
    expect(validateMovementConfig(DEFAULT_MOVEMENT_CONFIG)).toEqual([])
  })

  it('flags every invalid field with its own message', () => {
    const problems = validateMovementConfig({
      baseSpeed: 0,
      sprintMultiplier: 0.5,
      crouchMultiplier: 1.5,
      jumpImpulse: -1,
      gravity: 0,
      groundFriction: -1,
      airControl: 1.5,
      maxGroundSpeed: 0,
      maxAirSpeed: -1,
    })
    expect(problems).toHaveLength(9)
    expect(problems).toContain('baseSpeed must be positive')
    expect(problems).toContain('sprintMultiplier must be >= 1')
    expect(problems).toContain('crouchMultiplier must be between 0 and 1')
    expect(problems).toContain('jumpImpulse must be positive')
    expect(problems).toContain('gravity must be negative')
    expect(problems).toContain('groundFriction must be non-negative')
    expect(problems).toContain('airControl must be between 0 and 1')
    expect(problems).toContain('maxGroundSpeed must be positive')
    expect(problems).toContain('maxAirSpeed must be positive')
  })

  it('reports a single problem for a single violation', () => {
    const problems = validateMovementConfig({ ...DEFAULT_MOVEMENT_CONFIG, gravity: 0 })
    expect(problems).toEqual(['gravity must be negative'])
  })

  it('accepts boundary-valid values', () => {
    expect(validateMovementConfig({ ...DEFAULT_MOVEMENT_CONFIG, sprintMultiplier: 1 })).toEqual([])
    expect(validateMovementConfig({ ...DEFAULT_MOVEMENT_CONFIG, crouchMultiplier: 0 })).toEqual([])
    expect(validateMovementConfig({ ...DEFAULT_MOVEMENT_CONFIG, crouchMultiplier: 1 })).toEqual([])
    expect(validateMovementConfig({ ...DEFAULT_MOVEMENT_CONFIG, groundFriction: 0 })).toEqual([])
    expect(validateMovementConfig({ ...DEFAULT_MOVEMENT_CONFIG, airControl: 0 })).toEqual([])
    expect(validateMovementConfig({ ...DEFAULT_MOVEMENT_CONFIG, airControl: 1 })).toEqual([])
  })
})

describe('MOVEMENT_PRESETS', () => {
  it('covers exactly the four perspective presets', () => {
    expect(Object.keys(MOVEMENT_PRESETS).sort()).toEqual([...PRESETS].sort())
  })

  it('provides every configuration field in each preset', () => {
    const fields = Object.keys(DEFAULT_MOVEMENT_CONFIG).sort()
    for (const preset of PRESETS) {
      expect(Object.keys(MOVEMENT_PRESETS[preset]).sort()).toEqual(fields)
    }
  })

  it('every preset passes validateMovementConfig', () => {
    for (const preset of PRESETS) {
      expect(validateMovementConfig(MOVEMENT_PRESETS[preset])).toEqual([])
    }
  })

  it('keeps the top-down hop shorter than the default configuration', () => {
    const hopHeight = (config: MovementConfig): number => config.jumpImpulse ** 2 / (2 * Math.abs(config.gravity))
    expect(hopHeight(MOVEMENT_PRESETS['top-down'])).toBeLessThan(hopHeight(DEFAULT_MOVEMENT_CONFIG))
  })
})

describe('resolveMovementConfig', () => {
  it('returns the preset values when no overrides are given', () => {
    for (const preset of PRESETS) {
      expect(resolveMovementConfig(preset)).toEqual(MOVEMENT_PRESETS[preset])
    }
  })

  it('applies overrides over the preset values', () => {
    const preset = MOVEMENT_PRESETS['third-person']
    const resolved = resolveMovementConfig('third-person', { baseSpeed: 12, gravity: -40 })
    expect(resolved).toEqual({ ...preset, baseSpeed: 12, gravity: -40 })
  })

  it('produces a valid configuration from a preset and valid overrides', () => {
    const resolved = resolveMovementConfig('first-person', { sprintMultiplier: 2, maxAirSpeed: 8 })
    expect(validateMovementConfig(resolved)).toEqual([])
  })
})
