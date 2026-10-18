import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANIMATION_CONFIG,
  createAnimationState,
  crossfadeTo,
  getCurrentClip,
  isAnimationLooping,
  updateAnimation,
  validateAnimationConfig,
} from '../src/index.ts'

const idleClip = { id: 'idle', name: 'Idle', duration: 1, loop: true, rootMotion: false }
const runClip = { id: 'run', name: 'Run', duration: 1, loop: true, rootMotion: true }
const attackClip = { id: 'attack', name: 'Attack', duration: 1, loop: false, rootMotion: false }

const config = {
  clips: [idleClip, runClip, attackClip],
  transitions: [
    { from: 'idle', to: 'run', condition: 'start moving', crossfadeDuration: 0.2, minTime: 0 },
    { from: 'run', to: 'idle', condition: 'stop moving', crossfadeDuration: 0.3, minTime: 0.1 },
  ],
  defaultCrossfadeDuration: 0.2,
  defaultSpeed: 1,
}

describe('createAnimationState', () => {
  it('creates a playing state at time zero for a known clip', () => {
    const state = createAnimationState('idle', config)
    expect(state.currentClip).toBe('idle')
    expect(state.time).toBe(0)
    expect(state.playing).toBe(true)
    expect(state.speed).toBe(1)
    expect(state.finished).toBe(false)
    expect(state.crossfadeTarget).toBeNull()
    expect(state.crossfadeProgress).toBe(0)
  })
  it('does not mark a freshly created non-looping clip as finished', () => {
    const state = createAnimationState('attack', config)
    expect(state.playing).toBe(true)
    expect(state.finished).toBe(false)
    expect(state.time).toBe(0)
  })
  it('creates a stopped state when the clip id is null', () => {
    const state = createAnimationState(null, config)
    expect(state.currentClip).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.finished).toBe(false)
    expect(state.time).toBe(0)
  })
  it('applies the configured default speed', () => {
    const state = createAnimationState('idle', { ...config, defaultSpeed: 2.5 })
    expect(state.speed).toBe(2.5)
  })
  it('keeps the requested id when the clip is unknown', () => {
    const state = createAnimationState('ghost', config)
    expect(state.currentClip).toBe('ghost')
    expect(state.time).toBe(0)
    expect(state.crossfadeTarget).toBeNull()
  })
  it('works with the default animation config', () => {
    const state = createAnimationState(null, DEFAULT_ANIMATION_CONFIG)
    expect(state.playing).toBe(false)
    expect(state.speed).toBe(DEFAULT_ANIMATION_CONFIG.defaultSpeed)
  })
})

describe('updateAnimation', () => {
  it('advances time by deltaTime times speed within the per-frame clamp', () => {
    const s0 = createAnimationState('idle', config)
    const s1 = updateAnimation(s0, config, 0.05, null)
    expect(s1.time).toBe(0.05)
    expect(s1.playing).toBe(true)
    expect(s1.finished).toBe(false)
  })
  it('clamps a large deltaTime to 0.1 seconds', () => {
    const s0 = createAnimationState('idle', config)
    const s1 = updateAnimation(s0, config, 5, null)
    expect(s1.time).toBe(0.1)
  })
  it('ignores a negative deltaTime', () => {
    const s0 = createAnimationState('idle', config)
    const s1 = updateAnimation(s0, config, -1, null)
    expect(s1.time).toBe(0)
  })
  it('multiplies the advance by playback speed', () => {
    const fast = { ...config, defaultSpeed: 2 }
    const s0 = createAnimationState('idle', fast)
    const s1 = updateAnimation(s0, fast, 0.1, null)
    expect(s1.time).toBe(0.2)
  })
  it('finishes a non-looping clip once time reaches its duration', () => {
    const fast = { ...config, defaultSpeed: 10 }
    let state = createAnimationState('attack', fast)
    state = updateAnimation(state, fast, 0.1, null)
    expect(state.time).toBe(1)
    expect(state.finished).toBe(true)
    expect(state.playing).toBe(false)
  })
  it('keeps a finished non-looping clip pinned at its duration', () => {
    const fast = { ...config, defaultSpeed: 10 }
    let state = createAnimationState('attack', fast)
    state = updateAnimation(state, fast, 0.1, null)
    state = updateAnimation(state, fast, 0.1, null)
    expect(state.time).toBe(1)
    expect(state.finished).toBe(true)
    expect(state.playing).toBe(false)
  })
  it('finishes a slow non-looping clip after enough frames', () => {
    let state = createAnimationState('attack', config)
    for (let i = 0; i < 15; i += 1) {
      state = updateAnimation(state, config, 0.1, null)
    }
    expect(state.time).toBe(1)
    expect(state.finished).toBe(true)
    expect(state.playing).toBe(false)
  })
  it('never finishes a looping clip and lets time pass its duration', () => {
    const fast = { ...config, defaultSpeed: 10 }
    let state = createAnimationState('idle', fast)
    state = updateAnimation(state, fast, 0.1, null)
    state = updateAnimation(state, fast, 0.1, null)
    expect(state.time).toBe(2)
    expect(state.playing).toBe(true)
    expect(state.finished).toBe(false)
  })
  it('starts a crossfade when the requested clip exists', () => {
    const s0 = createAnimationState('idle', config)
    const s1 = updateAnimation(s0, config, 0.1, 'run')
    expect(s1.crossfadeTarget).toBe('run')
    expect(s1.crossfadeProgress).toBe(0)
    expect(s1.currentClip).toBe('idle')
  })
  it('ignores a requested clip that is not in the config', () => {
    const s0 = createAnimationState('idle', config)
    const s1 = updateAnimation(s0, config, 0.1, 'ghost')
    expect(s1.crossfadeTarget).toBeNull()
  })
  it('ignores a requested clip equal to the current clip', () => {
    const s0 = createAnimationState('idle', config)
    const s1 = updateAnimation(s0, config, 0.1, 'idle')
    expect(s1.crossfadeTarget).toBeNull()
  })
  it('ignores new clip requests during an active crossfade', () => {
    const s0 = crossfadeTo(createAnimationState('idle', config), 'run', 0.2)
    const s1 = updateAnimation(s0, config, 0.1, 'attack')
    expect(s1.crossfadeTarget).toBe('run')
    expect(s1.crossfadeProgress).toBe(0.1)
  })
  it('advances crossfade progress each frame at speed 1', () => {
    let state = crossfadeTo(createAnimationState('idle', config), 'run', 0.2)
    for (let i = 0; i < 5; i += 1) {
      state = updateAnimation(state, config, 0.1, null)
    }
    expect(state.crossfadeProgress).toBe(0.5)
    expect(state.currentClip).toBe('idle')
    expect(state.crossfadeTarget).toBe('run')
  })
  it('completes a crossfade after sustained frames', () => {
    let state = crossfadeTo(createAnimationState('idle', config), 'run', 0.2)
    for (let i = 0; i < 20; i += 1) {
      state = updateAnimation(state, config, 0.1, null)
      if (state.crossfadeTarget === null) break
    }
    expect(state.currentClip).toBe('run')
    expect(state.crossfadeTarget).toBeNull()
    expect(state.crossfadeProgress).toBe(0)
    expect(state.playing).toBe(true)
  })
  it('advances crossfade progress more slowly at higher speed', () => {
    const fast = { ...config, defaultSpeed: 2 }
    const s0 = crossfadeTo(createAnimationState('idle', fast), 'run', 0.2)
    const s1 = updateAnimation(s0, fast, 0.1, null)
    expect(s1.crossfadeProgress).toBe(0.025)
    expect(s1.currentClip).toBe('idle')
  })
  it('completes a self crossfade in one frame', () => {
    const s0 = crossfadeTo(createAnimationState('idle', config), 'idle', 0.2)
    const s1 = updateAnimation(s0, config, 0.1, null)
    expect(s1.currentClip).toBe('idle')
    expect(s1.crossfadeTarget).toBeNull()
    expect(s1.crossfadeProgress).toBe(0)
  })
  it('returns a new state without mutating the input', () => {
    const s0 = createAnimationState('idle', config)
    const s1 = updateAnimation(s0, config, 0.5, 'run')
    expect(Object.is(s1, s0)).toBe(false)
    expect(s0.time).toBe(0)
    expect(s0.crossfadeTarget).toBeNull()
  })
})

describe('crossfadeTo', () => {
  it('sets the crossfade target and resets progress', () => {
    const base = { ...createAnimationState('idle', config), crossfadeProgress: 0.7 }
    const state = crossfadeTo(base, 'run', 0.3)
    expect(state.crossfadeTarget).toBe('run')
    expect(state.crossfadeProgress).toBe(0)
  })
  it('leaves playback fields untouched', () => {
    const s0 = createAnimationState('idle', config)
    const state = crossfadeTo(s0, 'run', 0.3)
    expect(state.currentClip).toBe('idle')
    expect(state.time).toBe(s0.time)
    expect(state.playing).toBe(s0.playing)
    expect(state.finished).toBe(s0.finished)
    expect(state.speed).toBe(s0.speed)
  })
})

describe('validateAnimationConfig', () => {
  it('accepts the default empty config', () => {
    expect(validateAnimationConfig(DEFAULT_ANIMATION_CONFIG)).toEqual([])
  })
  it('accepts a well-formed config', () => {
    expect(validateAnimationConfig(config)).toEqual([])
  })
  it('rejects a clip with zero or negative duration', () => {
    const bad = { ...config, clips: [...config.clips, { id: 'bad', name: 'Bad', duration: 0, loop: false, rootMotion: false }] }
    expect(validateAnimationConfig(bad)).toContain("clip 'bad' duration must be positive")
    const worse = { ...config, clips: [...config.clips, { id: 'worse', name: 'Worse', duration: -1, loop: false, rootMotion: false }] }
    expect(validateAnimationConfig(worse)).toContain("clip 'worse' duration must be positive")
  })
  it('rejects transitions referencing unknown clips', () => {
    const bad = {
      ...config,
      transitions: [
        { from: 'ghost', to: 'idle', condition: 'x', crossfadeDuration: 0.1, minTime: 0 },
        { from: 'idle', to: 'ghost', condition: 'x', crossfadeDuration: 0.1, minTime: 0 },
      ],
    }
    const problems = validateAnimationConfig(bad)
    expect(problems).toContain("transition from unknown clip 'ghost'")
    expect(problems).toContain("transition to unknown clip 'ghost'")
  })
  it('rejects negative crossfadeDuration and minTime', () => {
    const bad = {
      ...config,
      transitions: [{ from: 'idle', to: 'run', condition: 'x', crossfadeDuration: -0.1, minTime: -1 }],
    }
    const problems = validateAnimationConfig(bad)
    expect(problems).toContain('transition crossfadeDuration must be non-negative')
    expect(problems).toContain('transition minTime must be non-negative')
  })
  it('rejects a negative default crossfade duration', () => {
    const problems = validateAnimationConfig({ ...config, defaultCrossfadeDuration: -1 })
    expect(problems).toContain('defaultCrossfadeDuration must be non-negative')
  })
  it('rejects a non-positive default speed', () => {
    const problems = validateAnimationConfig({ ...config, defaultSpeed: 0 })
    expect(problems).toContain('defaultSpeed must be positive')
  })
  it('collects every problem in one pass', () => {
    const bad = {
      clips: [{ id: 'bad', name: 'Bad', duration: 0, loop: false, rootMotion: false }],
      transitions: [{ from: 'ghost', to: 'other', condition: 'x', crossfadeDuration: -0.1, minTime: -1 }],
      defaultCrossfadeDuration: -1,
      defaultSpeed: 0,
    }
    const problems = validateAnimationConfig(bad)
    expect(problems).toHaveLength(7)
  })
})

describe('getCurrentClip', () => {
  it('returns the clip backing the current state', () => {
    const state = createAnimationState('run', config)
    const clip = getCurrentClip(state, config)
    expect(clip === null).toBe(false)
    if (clip !== null) {
      expect(clip.id).toBe('run')
      expect(clip.name).toBe('Run')
      expect(clip.duration).toBe(1)
      expect(clip.rootMotion).toBe(true)
    }
  })
  it('returns null when no clip is set', () => {
    const state = createAnimationState(null, config)
    expect(getCurrentClip(state, config)).toBeNull()
  })
  it('returns null for an unknown clip id', () => {
    const state = createAnimationState('ghost', config)
    expect(getCurrentClip(state, config)).toBeNull()
  })
})

describe('isAnimationLooping', () => {
  it('true for a looping clip', () => {
    expect(isAnimationLooping(createAnimationState('idle', config), config)).toBe(true)
  })
  it('false for a non-looping clip', () => {
    expect(isAnimationLooping(createAnimationState('attack', config), config)).toBe(false)
  })
  it('false when no clip is set or the clip is unknown', () => {
    expect(isAnimationLooping(createAnimationState(null, config), config)).toBe(false)
    expect(isAnimationLooping(createAnimationState('ghost', config), config)).toBe(false)
  })
})
