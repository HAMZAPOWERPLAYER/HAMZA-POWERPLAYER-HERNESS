import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THREAT_CONFIG,
  createThreatState,
  updateHorrorAtmosphere,
  updateThreat,
  validateThreatConfig,
} from '../src/index.ts'
import type { HorrorAtmosphere, ThreatConfig, ThreatState } from '../src/index.ts'

/** A calm atmosphere whose values keep the arithmetic expectations deterministic. */
const calm: HorrorAtmosphere = {
  tension: 0.25,
  fear: 0,
  lighting: 1,
  audioIntensity: 0,
  safeArea: true,
  ambientSound: 'drip',
}

/** An idle threat at the origin built from the default configuration. */
function idleThreat(overrides: Partial<ThreatState> = {}): ThreatState {
  return { ...createThreatState('wolf', [0, 0, 0], DEFAULT_THREAT_CONFIG), ...overrides }
}

describe('updateHorrorAtmosphere', () => {
  it('raises tension while a threat is nearby', () => {
    const result = updateHorrorAtmosphere(calm, 0.0625, false, true, false)
    expect(result.state.tension).toBe(0.28125)
    expect(result.tensionChanged).toBe(true)
    expect(result.state.fear).toBe(0)
    expect(result.fearChanged).toBe(false)
    expect(result.state.lighting).toBe(1)
    expect(result.state.audioIntensity).toBe(0.28125 * 0.8 + 0.2)
    expect(result.state.safeArea).toBe(false)
    expect(result.state.ambientSound).toBe('drip')
  })

  it('holds tension and fear at their upper bound', () => {
    const maxed: HorrorAtmosphere = {
      tension: 1,
      fear: 1,
      lighting: 0.5,
      audioIntensity: 1,
      safeArea: false,
      ambientSound: null,
    }
    const result = updateHorrorAtmosphere(maxed, 0.0625, true, false, true)
    expect(result.state.tension).toBe(1)
    expect(result.tensionChanged).toBe(false)
    expect(result.state.fear).toBe(1)
    expect(result.fearChanged).toBe(false)
    expect(result.state.lighting).toBe(0.5 - 0.0625 * 0.3)
    expect(result.state.audioIntensity).toBe(1)
    expect(result.state.ambientSound).toBeNull()
  })

  it('lowers tension when the player is safe', () => {
    const tense: HorrorAtmosphere = {
      tension: 0.5,
      fear: 0.25,
      lighting: 0.8,
      audioIntensity: 0.9,
      safeArea: false,
      ambientSound: 'wind',
    }
    const result = updateHorrorAtmosphere(tense, 0.0625, false, false, true)
    expect(result.state.tension).toBe(0.4875)
    expect(result.tensionChanged).toBe(true)
    expect(result.state.fear).toBe(0.25 - 0.0625 * 0.1)
    expect(result.fearChanged).toBe(true)
    expect(result.state.lighting).toBe(0.8 + 0.0625 * 0.1)
    expect(result.state.audioIntensity).toBe(0.4875 * 0.8 + 0.2)
    expect(result.state.safeArea).toBe(true)
  })

  it('holds tension and fear at zero while lighting recovers', () => {
    const dark: HorrorAtmosphere = {
      tension: 0,
      fear: 0,
      lighting: 0,
      audioIntensity: 0,
      safeArea: false,
      ambientSound: null,
    }
    const result = updateHorrorAtmosphere(dark, 0.0625, false, false, false)
    expect(result.state.tension).toBe(0)
    expect(result.tensionChanged).toBe(false)
    expect(result.state.fear).toBe(0)
    expect(result.fearChanged).toBe(false)
    expect(result.state.lighting).toBe(0.00625)
    expect(result.state.ambientSound).toBeNull()
  })

  it('never darkens lighting below zero', () => {
    const pitchBlack: HorrorAtmosphere = { ...calm, tension: 0.9, lighting: 0 }
    const result = updateHorrorAtmosphere(pitchBlack, 0.0625, false, false, false)
    expect(result.state.tension).toBe(0.9 - 0.0625 * 0.2)
    expect(result.state.lighting).toBe(0)
  })

  it('grows fear when tension passes 0.5 in the same frame', () => {
    const rising: HorrorAtmosphere = {
      ...calm,
      tension: 0.48,
      fear: 0.2,
      audioIntensity: 0.5,
      ambientSound: 'creak',
    }
    const result = updateHorrorAtmosphere(rising, 0.0625, true, false, false)
    expect(result.state.tension).toBe(0.48 + 0.0625 * 0.5)
    expect(result.state.fear).toBe(0.2 + 0.0625 * 0.3)
    expect(result.tensionChanged).toBe(true)
    expect(result.fearChanged).toBe(true)
    expect(result.state.lighting).toBe(1)
  })

  it('recomputes audio intensity even with a zero-length frame', () => {
    const stale: HorrorAtmosphere = {
      ...calm,
      tension: 0.6,
      fear: 0.4,
      audioIntensity: 0.9,
      ambientSound: 'hum',
    }
    const result = updateHorrorAtmosphere(stale, 0, false, false, true)
    expect(result.state.tension).toBe(0.6)
    expect(result.tensionChanged).toBe(false)
    expect(result.state.fear).toBe(0.4)
    expect(result.fearChanged).toBe(false)
    expect(result.state.lighting).toBe(1)
    expect(result.state.audioIntensity).toBe(0.6 * 0.8 + 0.2)
  })

  it('treats a negative delta as a zero-length frame', () => {
    const result = updateHorrorAtmosphere(calm, -5, true, true, true)
    expect(result.state.tension).toBe(0.25)
    expect(result.tensionChanged).toBe(false)
    expect(result.state.fear).toBe(0)
    expect(result.fearChanged).toBe(false)
    expect(result.state.safeArea).toBe(true)
  })

  it('clamps a long frame to one tenth of a second', () => {
    const result = updateHorrorAtmosphere(calm, 5, true, false, false)
    expect(result.state.tension).toBe(0.25 + 0.1 * 0.5)
    expect(result.tensionChanged).toBe(true)
    expect(result.state.audioIntensity).toBe((0.25 + 0.1 * 0.5) * 0.8 + 0.2)
  })

  it('takes the safe-area flag from the caller, not the previous state', () => {
    const dangerZone: HorrorAtmosphere = { ...calm, safeArea: false }
    expect(updateHorrorAtmosphere(dangerZone, 0, false, false, true).state.safeArea).toBe(true)
    expect(updateHorrorAtmosphere(calm, 0, false, false, false).state.safeArea).toBe(false)
  })
})

describe('updateThreat', () => {
  it('detects a visible player within range and starts pursuing', () => {
    const result = updateThreat(idleThreat(), DEFAULT_THREAT_CONFIG, 0.0625, [5, 0, 0], true)
    expect(result.detectedPlayer).toBe(true)
    expect(result.attacked).toBe(false)
    expect(result.state.state).toBe('pursuing')
    expect(result.state.targetPosition).toEqual([5, 0, 0])
    expect(result.state.timeSinceLastAttack).toBe(2.0625)
    expect(result.state.id).toBe('wolf')
    expect(result.state.position).toEqual([0, 0, 0])
  })

  it('ignores a player beyond detection range', () => {
    const result = updateThreat(idleThreat(), DEFAULT_THREAT_CONFIG, 0.0625, [50, 0, 0], true)
    expect(result.detectedPlayer).toBe(false)
    expect(result.state.state).toBe('idle')
    expect(result.state.targetPosition).toBeNull()
  })

  it('does not detect without line of sight', () => {
    const result = updateThreat(idleThreat(), DEFAULT_THREAT_CONFIG, 0.0625, [1, 0, 0], false)
    expect(result.detectedPlayer).toBe(false)
    expect(result.state.state).toBe('idle')
  })

  it('does not detect without a player position', () => {
    const result = updateThreat(idleThreat(), DEFAULT_THREAT_CONFIG, 0.0625, null, true)
    expect(result.detectedPlayer).toBe(false)
    expect(result.state.state).toBe('idle')
    expect(result.state.targetPosition).toBeNull()
  })

  it('applies the configured ranges to the resulting state', () => {
    const wide: ThreatConfig = { ...DEFAULT_THREAT_CONFIG, detectionRange: 40, attackRange: 6 }
    const scout = createThreatState('scout', [0, 0, 0], DEFAULT_THREAT_CONFIG)
    const result = updateThreat(scout, wide, 0.0625, [20, 0, 0], true)
    expect(result.state.detectionRange).toBe(40)
    expect(result.state.attackRange).toBe(6)
    expect(result.detectedPlayer).toBe(true)
    expect(result.state.state).toBe('pursuing')
  })

  it('enters attacking when the player is within attack range', () => {
    const threat = idleThreat({ state: 'pursuing' })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [1, 0, 0], true)
    expect(result.state.state).toBe('attacking')
    expect(result.state.targetPosition).toEqual([1, 0, 0])
    expect(result.attacked).toBe(false)
    expect(result.detectedPlayer).toBe(true)
  })

  it('attacks once the cooldown has elapsed and resets the timer', () => {
    const threat = idleThreat({ state: 'attacking', timeSinceLastAttack: 3 })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [1, 0, 0], true)
    expect(result.attacked).toBe(true)
    expect(result.state.timeSinceLastAttack).toBe(0)
    expect(result.state.state).toBe('attacking')
  })

  it('waits for the cooldown before attacking', () => {
    const threat = idleThreat({ state: 'attacking', timeSinceLastAttack: 0 })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [1, 0, 0], true)
    expect(result.attacked).toBe(false)
    expect(result.state.timeSinceLastAttack).toBe(0.0625)
    expect(result.state.state).toBe('attacking')
  })

  it('does not attack a player it cannot see', () => {
    const threat = idleThreat({ state: 'attacking', timeSinceLastAttack: 10 })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [1, 0, 0], false)
    expect(result.attacked).toBe(false)
    expect(result.detectedPlayer).toBe(false)
    expect(result.state.state).toBe('attacking')
    expect(result.state.timeSinceLastAttack).toBe(10.0625)
  })

  it('returns to pursuing when the player leaves attack range', () => {
    const threat = idleThreat({ state: 'attacking', timeSinceLastAttack: 1 })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [10, 0, 0], true)
    expect(result.state.state).toBe('pursuing')
    expect(result.attacked).toBe(false)
    expect(result.state.targetPosition).toEqual([10, 0, 0])
  })

  it('pursuing times out to searching only past five seconds', () => {
    const atLimit = idleThreat({ state: 'pursuing', timeSinceLastAttack: 5 })
    expect(updateThreat(atLimit, DEFAULT_THREAT_CONFIG, 0.0625, null, false).state.state).toBe('pursuing')
    const pastLimit = idleThreat({ state: 'pursuing', timeSinceLastAttack: 5.5 })
    expect(updateThreat(pastLimit, DEFAULT_THREAT_CONFIG, 0.0625, null, false).state.state).toBe('searching')
  })

  it('searching times out to idle past five seconds', () => {
    const atLimit = idleThreat({ state: 'searching', timeSinceLastAttack: 5 })
    expect(updateThreat(atLimit, DEFAULT_THREAT_CONFIG, 0.0625, null, false).state.state).toBe('searching')
    const pastLimit = idleThreat({ state: 'searching', timeSinceLastAttack: 6 })
    const result = updateThreat(pastLimit, DEFAULT_THREAT_CONFIG, 0.0625, null, false)
    expect(result.state.state).toBe('idle')
    expect(result.state.targetPosition).toBeNull()
  })

  it('searching resumes pursuit on detection', () => {
    const threat = idleThreat({ state: 'searching', timeSinceLastAttack: 0 })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [3, 0, 0], true)
    expect(result.state.state).toBe('pursuing')
    expect(result.state.targetPosition).toEqual([3, 0, 0])
  })

  it('detecting gives up only past three seconds', () => {
    const atLimit = idleThreat({ state: 'detecting', timeSinceLastAttack: 3 })
    expect(updateThreat(atLimit, DEFAULT_THREAT_CONFIG, 0.0625, null, false).state.state).toBe('detecting')
    const pastLimit = idleThreat({ state: 'detecting', timeSinceLastAttack: 4 })
    const result = updateThreat(pastLimit, DEFAULT_THREAT_CONFIG, 0.0625, null, false)
    expect(result.state.state).toBe('idle')
    expect(result.state.targetPosition).toBeNull()
  })

  it('detecting resumes pursuit on detection', () => {
    const threat = idleThreat({ state: 'detecting', timeSinceLastAttack: 0 })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [4, 0, 0], true)
    expect(result.state.state).toBe('pursuing')
    expect(result.state.targetPosition).toEqual([4, 0, 0])
  })

  it('retreat resumes pursuit on detection', () => {
    const threat = idleThreat({ state: 'retreat', timeSinceLastAttack: 0 })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [4, 0, 0], true)
    expect(result.state.state).toBe('pursuing')
    expect(result.state.targetPosition).toEqual([4, 0, 0])
  })

  it('never resurrects a dead threat', () => {
    const threat = idleThreat({ state: 'dead' })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [1, 0, 0], true)
    expect(result.state.state).toBe('dead')
    expect(result.attacked).toBe(false)
  })

  it('leaves an inactive threat alone except for its attack timer', () => {
    const threat = idleThreat({ active: false })
    const result = updateThreat(threat, DEFAULT_THREAT_CONFIG, 0.0625, [1, 0, 0], true)
    expect(result.state.state).toBe('idle')
    expect(result.state.targetPosition).toBeNull()
    expect(result.detectedPlayer).toBe(false)
    expect(result.attacked).toBe(false)
    expect(result.state.timeSinceLastAttack).toBe(2.0625)
  })

  it('clamps a long frame to one tenth of a second', () => {
    const result = updateThreat(idleThreat(), DEFAULT_THREAT_CONFIG, 5, null, false)
    expect(result.state.timeSinceLastAttack).toBe(2.1)
  })

  it('treats a negative delta as a zero-length frame', () => {
    const result = updateThreat(idleThreat(), DEFAULT_THREAT_CONFIG, -5, [5, 0, 0], true)
    expect(result.state.timeSinceLastAttack).toBe(2)
    expect(result.state.state).toBe('pursuing')
  })
})

describe('createThreatState', () => {
  it('creates an idle, active threat with no target', () => {
    const threat = createThreatState('wolf', [1, 2, 3], DEFAULT_THREAT_CONFIG)
    expect(threat.id).toBe('wolf')
    expect(threat.position).toEqual([1, 2, 3])
    expect(threat.state).toBe('idle')
    expect(threat.active).toBe(true)
    expect(threat.targetPosition).toBeNull()
    expect(threat.timeSinceLastAttack).toBe(DEFAULT_THREAT_CONFIG.attackCooldown)
    expect(threat.detectionRange).toBe(DEFAULT_THREAT_CONFIG.detectionRange)
    expect(threat.attackRange).toBe(DEFAULT_THREAT_CONFIG.attackRange)
  })

  it('copies the ranges from a custom config', () => {
    const custom: ThreatConfig = {
      detectionRange: 7,
      attackRange: 2,
      moveSpeed: 1,
      attackCooldown: 0.5,
      pursuitSpeed: 4,
    }
    const threat = createThreatState('guard', [0, 0, 0], custom)
    expect(threat.detectionRange).toBe(7)
    expect(threat.attackRange).toBe(2)
    expect(threat.timeSinceLastAttack).toBe(0.5)
  })
})

describe('validateThreatConfig', () => {
  it('accepts the default configuration', () => {
    expect(validateThreatConfig(DEFAULT_THREAT_CONFIG)).toEqual([])
  })

  it('reports every non-positive field', () => {
    const bad: ThreatConfig = {
      detectionRange: 0,
      attackRange: 0,
      moveSpeed: 0,
      attackCooldown: 0,
      pursuitSpeed: 0,
    }
    expect(validateThreatConfig(bad)).toEqual([
      'detectionRange must be positive',
      'attackRange must be positive',
      'moveSpeed must be positive',
      'attackCooldown must be positive',
      'pursuitSpeed must be positive',
    ])
  })

  it('rejects negative values', () => {
    const negative: ThreatConfig = {
      detectionRange: -1,
      attackRange: -2,
      moveSpeed: -3,
      attackCooldown: -4,
      pursuitSpeed: -5,
    }
    const problems = validateThreatConfig(negative)
    expect(problems).toHaveLength(5)
    expect(problems).toContain('moveSpeed must be positive')
  })

  it('reports an attack range beyond the detection range', () => {
    const wide: ThreatConfig = { ...DEFAULT_THREAT_CONFIG, detectionRange: 2, attackRange: 5 }
    expect(validateThreatConfig(wide)).toEqual(['attackRange should not exceed detectionRange'])
  })

  it('allows an attack range equal to the detection range', () => {
    const tight: ThreatConfig = { ...DEFAULT_THREAT_CONFIG, detectionRange: 3, attackRange: 3 }
    expect(validateThreatConfig(tight)).toEqual([])
  })
})

describe('DEFAULT_THREAT_CONFIG', () => {
  it('pins documented defaults', () => {
    expect(DEFAULT_THREAT_CONFIG).toEqual({
      detectionRange: 12,
      attackRange: 2.5,
      moveSpeed: 3.5,
      attackCooldown: 2,
      pursuitSpeed: 5,
    })
  })

  it('is itself a valid configuration', () => {
    expect(validateThreatConfig(DEFAULT_THREAT_CONFIG)).toEqual([])
  })
})
