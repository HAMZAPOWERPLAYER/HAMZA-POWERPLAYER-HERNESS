import { describe, expect, it } from 'vitest'
import {
  advanceAudio,
  createAudioState,
  requestPlayback,
  stopByCategory,
  stopPlayback,
  validateAudioCatalog,
} from '../src/game-audio.ts'
import type { AudioCatalog, AudioCategories } from '../src/game-audio.ts'

const categories: AudioCategories = {
  music: { volume: 1, muted: false },
  sfx: { volume: 0.8, muted: false },
  ambience: { volume: 0.5, muted: false },
  ui: { volume: 1, muted: true },
}

const catalog: AudioCatalog = [
  { id: 'bgm-main', category: 'music', looping: true, spatial: false },
  { id: 'jump', category: 'sfx', looping: false, spatial: false, durationSeconds: 0.4 },
  { id: 'footstep', category: 'sfx', looping: false, spatial: true, durationSeconds: 0.2, cooldownSeconds: 0.5 },
  { id: 'wind', category: 'ambience', looping: true, spatial: true },
  { id: 'click', category: 'ui', looping: false, spatial: false, durationSeconds: 0.1 },
]

describe('createAudioState', () => {
  it('creates a state with no voices and no history', () => {
    const state = createAudioState()
    expect(state.voices).toEqual([])
    expect(state.lastPlayedAt).toEqual({})
  })
})

describe('requestPlayback', () => {
  it('starts a one-shot voice and records lastPlayedAt', () => {
    const decision = requestPlayback(createAudioState(), catalog, categories, 'jump', 7)
    expect(decision.played).toBe(true)
    expect(decision.reason).toBeNull()
    expect(decision.state.voices).toEqual([
      { eventId: 'jump', category: 'sfx', startedAt: 7, remainingSeconds: 0.4 },
    ])
    expect(decision.state.lastPlayedAt).toEqual({ jump: 7 })
  })
  it('starts a looping voice with no expiry', () => {
    const decision = requestPlayback(createAudioState(), catalog, categories, 'bgm-main', 3)
    expect(decision.played).toBe(true)
    expect(decision.state.voices[0]?.remainingSeconds).toBeNull()
    expect(decision.state.voices[0]?.startedAt).toBe(3)
  })
  it('rejects an unknown event', () => {
    const decision = requestPlayback(createAudioState(), catalog, categories, 'nope', 0)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("unknown event 'nope'")
    expect(decision.state).toEqual({ voices: [], lastPlayedAt: {} })
  })
  it('rejects an event referencing an unknown category', () => {
    const orphanCatalog: AudioCatalog = [
      { id: 'beep', category: 'voice', looping: false, spatial: false, durationSeconds: 0.1 },
    ]
    const decision = requestPlayback(createAudioState(), orphanCatalog, categories, 'beep', 0)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("event 'beep' references unknown category 'voice'")
  })
  it('rejects playback in a muted category', () => {
    const decision = requestPlayback(createAudioState(), catalog, categories, 'click', 0)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("category 'ui' is muted")
  })
  it('rejects playback in a zero-volume category', () => {
    const silent: AudioCategories = { ...categories, sfx: { volume: 0, muted: false } }
    const decision = requestPlayback(createAudioState(), catalog, silent, 'jump', 0)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("category 'sfx' volume is zero")
  })
  it('rejects playback in a negative-volume category', () => {
    const invalid: AudioCategories = { ...categories, sfx: { volume: -0.5, muted: false } }
    const decision = requestPlayback(createAudioState(), catalog, invalid, 'jump', 0)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("category 'sfx' volume is zero")
  })
  it('allows the first play of a cooldown event', () => {
    const decision = requestPlayback(createAudioState(), catalog, categories, 'footstep', 10)
    expect(decision.played).toBe(true)
  })
  it('rejects a cooldown replay strictly before the boundary', () => {
    const first = requestPlayback(createAudioState(), catalog, categories, 'footstep', 10)
    const decision = requestPlayback(first.state, catalog, categories, 'footstep', 10.499)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("event 'footstep' is on cooldown")
    expect(decision.state).toBe(first.state)
  })
  it('allows a cooldown replay exactly at the boundary', () => {
    const first = requestPlayback(createAudioState(), catalog, categories, 'footstep', 10)
    const decision = requestPlayback(first.state, catalog, categories, 'footstep', 10.5)
    expect(decision.played).toBe(true)
    expect(decision.reason).toBeNull()
    expect(decision.state.lastPlayedAt).toEqual({ footstep: 10.5 })
  })
  it('rejects a duplicate looping playback while the voice is active', () => {
    const first = requestPlayback(createAudioState(), catalog, categories, 'bgm-main', 0)
    const decision = requestPlayback(first.state, catalog, categories, 'bgm-main', 500)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("event 'bgm-main' is already playing")
    expect(decision.state).toBe(first.state)
  })
  it('allows overlapping voices of a non-looping event', () => {
    const first = requestPlayback(createAudioState(), catalog, categories, 'jump', 0)
    const second = requestPlayback(first.state, catalog, categories, 'jump', 0.1)
    expect(second.played).toBe(true)
    expect(second.state.voices).toHaveLength(2)
  })
  it('rejects a non-looping event without durationSeconds', () => {
    const boomCatalog: AudioCatalog = [
      { id: 'boom', category: 'sfx', looping: false, spatial: false },
    ]
    const decision = requestPlayback(createAudioState(), boomCatalog, categories, 'boom', 0)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("event 'boom' has no durationSeconds")
  })
  it('rejects a non-looping event with non-positive durationSeconds', () => {
    const zapCatalog: AudioCatalog = [
      { id: 'zap', category: 'sfx', looping: false, spatial: false, durationSeconds: 0 },
    ]
    const decision = requestPlayback(createAudioState(), zapCatalog, categories, 'zap', 0)
    expect(decision.played).toBe(false)
    expect(decision.reason).toBe("event 'zap' durationSeconds must be positive")
  })
  it('leaves the input state unchanged after a successful request', () => {
    const state = createAudioState()
    requestPlayback(state, catalog, categories, 'jump', 4)
    expect(state).toEqual({ voices: [], lastPlayedAt: {} })
  })
  it('leaves the input state unchanged after a rejected request', () => {
    const started = requestPlayback(createAudioState(), catalog, categories, 'jump', 4).state
    const before = { voices: [...started.voices], lastPlayedAt: { ...started.lastPlayedAt } }
    requestPlayback(started, catalog, categories, 'nope', 5)
    expect(started).toEqual(before)
  })
})

describe('stopPlayback', () => {
  it('removes the voices of the event and keeps other voices', () => {
    let state = createAudioState()
    state = requestPlayback(state, catalog, categories, 'jump', 0).state
    state = requestPlayback(state, catalog, categories, 'bgm-main', 1).state
    const stopped = stopPlayback(state, 'jump')
    expect(stopped.voices).toHaveLength(1)
    expect(stopped.voices[0]?.eventId).toBe('bgm-main')
    expect(state.voices).toHaveLength(2)
  })
  it('keeps playback history for cooldowns', () => {
    const started = requestPlayback(createAudioState(), catalog, categories, 'jump', 6).state
    const stopped = stopPlayback(started, 'jump')
    expect(stopped.voices).toEqual([])
    expect(stopped.lastPlayedAt).toEqual({ jump: 6 })
  })
  it('returns the input state unchanged when no voice matches', () => {
    const state = requestPlayback(createAudioState(), catalog, categories, 'jump', 0).state
    expect(stopPlayback(state, 'wind')).toBe(state)
    const empty = createAudioState()
    expect(stopPlayback(empty, 'jump')).toBe(empty)
  })
})

describe('stopByCategory', () => {
  it('removes every voice of the category and keeps the rest', () => {
    let state = createAudioState()
    state = requestPlayback(state, catalog, categories, 'jump', 0).state
    state = requestPlayback(state, catalog, categories, 'footstep', 1).state
    state = requestPlayback(state, catalog, categories, 'bgm-main', 2).state
    const stopped = stopByCategory(state, 'sfx')
    expect(stopped.voices.map((voice) => voice.eventId)).toEqual(['bgm-main'])
    expect(state.voices).toHaveLength(3)
    expect(stopped.lastPlayedAt).toEqual(state.lastPlayedAt)
  })
  it('returns the input state unchanged when no voice matches', () => {
    const state = requestPlayback(createAudioState(), catalog, categories, 'bgm-main', 0).state
    expect(stopByCategory(state, 'sfx')).toBe(state)
  })
})

describe('advanceAudio', () => {
  it('decrements a one-shot voice before its boundary', () => {
    const state = requestPlayback(createAudioState(), catalog, categories, 'jump', 0).state
    const advanced = advanceAudio(state, 0.1)
    expect(advanced.voices).toHaveLength(1)
    expect(advanced.voices[0]?.remainingSeconds).toBeCloseTo(0.3)
    expect(state.voices[0]?.remainingSeconds).toBe(0.4)
  })
  it('expires a one-shot voice exactly at its boundary', () => {
    const state = requestPlayback(createAudioState(), catalog, categories, 'jump', 0).state
    const advanced = advanceAudio(state, 0.4)
    expect(advanced.voices).toEqual([])
    expect(advanced.lastPlayedAt).toEqual({ jump: 0 })
    expect(state.voices).toHaveLength(1)
  })
  it('keeps a looping voice across a large step', () => {
    const state = requestPlayback(createAudioState(), catalog, categories, 'wind', 3).state
    const advanced = advanceAudio(state, 100)
    expect(advanced.voices).toHaveLength(1)
    expect(advanced.voices[0]?.remainingSeconds).toBeNull()
    expect(advanced.voices[0]?.startedAt).toBe(3)
  })
  it('expires one-shot voices while keeping looping voices in one step', () => {
    let state = createAudioState()
    state = requestPlayback(state, catalog, categories, 'jump', 0).state
    state = requestPlayback(state, catalog, categories, 'bgm-main', 1).state
    const advanced = advanceAudio(state, 50)
    expect(advanced.voices.map((voice) => voice.eventId)).toEqual(['bgm-main'])
    expect(state.voices).toHaveLength(2)
  })
  it('treats a negative step as zero', () => {
    const state = requestPlayback(createAudioState(), catalog, categories, 'jump', 0).state
    expect(advanceAudio(state, -1)).toBe(state)
  })
  it('returns the input state unchanged when every voice loops', () => {
    const state = requestPlayback(createAudioState(), catalog, categories, 'bgm-main', 0).state
    expect(advanceAudio(state, 10)).toBe(state)
  })
  it('returns the input state unchanged for an empty state', () => {
    const state = createAudioState()
    expect(advanceAudio(state, 1)).toBe(state)
  })
})

describe('validateAudioCatalog', () => {
  it('reports no issues for a valid catalog', () => {
    expect(validateAudioCatalog(catalog, categories)).toEqual([])
  })
  it('reports a negative category volume', () => {
    const issueCategories: AudioCategories = { sfx: { volume: -0.01, muted: false } }
    expect(validateAudioCatalog([], issueCategories)).toEqual([
      "category 'sfx' volume must be in the range 0 to 1",
    ])
  })
  it('reports a category volume above 1', () => {
    const issueCategories: AudioCategories = { music: { volume: 1.5, muted: false } }
    expect(validateAudioCatalog([], issueCategories)).toEqual([
      "category 'music' volume must be in the range 0 to 1",
    ])
  })
  it('reports duplicate event ids', () => {
    const duplicateCatalog: AudioCatalog = [
      { id: 'jump', category: 'sfx', looping: false, spatial: false, durationSeconds: 1 },
      { id: 'jump', category: 'sfx', looping: false, spatial: false, durationSeconds: 1 },
    ]
    expect(validateAudioCatalog(duplicateCatalog, categories)).toEqual([
      "duplicate event id 'jump'",
    ])
  })
  it('reports an event referencing an unknown category', () => {
    const orphanCatalog: AudioCatalog = [
      { id: 'beep', category: 'voice', looping: true, spatial: false },
    ]
    expect(validateAudioCatalog(orphanCatalog, categories)).toEqual([
      "event 'beep' references unknown category 'voice'",
    ])
  })
  it('reports a non-looping event without durationSeconds', () => {
    const boomCatalog: AudioCatalog = [
      { id: 'boom', category: 'sfx', looping: false, spatial: false },
    ]
    expect(validateAudioCatalog(boomCatalog, categories)).toEqual([
      "event 'boom' is not looping and has no durationSeconds",
    ])
  })
  it('reports a non-positive durationSeconds', () => {
    const zapCatalog: AudioCatalog = [
      { id: 'zap', category: 'sfx', looping: false, spatial: false, durationSeconds: -1 },
    ]
    expect(validateAudioCatalog(zapCatalog, categories)).toEqual([
      "event 'zap' durationSeconds must be positive",
    ])
  })
  it('reports a non-positive cooldownSeconds', () => {
    const tapCatalog: AudioCatalog = [
      { id: 'tap', category: 'sfx', looping: false, spatial: false, durationSeconds: 1, cooldownSeconds: 0 },
    ]
    expect(validateAudioCatalog(tapCatalog, categories)).toEqual([
      "event 'tap' cooldownSeconds must be positive",
    ])
  })
  it('orders category issues before event issues with ascending category ids', () => {
    const issueCategories: AudioCategories = {
      sfx: { volume: -1, muted: false },
      music: { volume: 2, muted: false },
    }
    const orderedCatalog: AudioCatalog = [
      { id: 'dup', category: 'sfx', looping: false, spatial: false, durationSeconds: 1 },
      { id: 'dup', category: 'sfx', looping: false, spatial: false, durationSeconds: 1 },
      { id: 'orphan', category: 'voice', looping: true, spatial: false },
      { id: 'bad', category: 'sfx', looping: false, spatial: false, durationSeconds: -1 },
    ]
    expect(validateAudioCatalog(orderedCatalog, issueCategories)).toEqual([
      "category 'music' volume must be in the range 0 to 1",
      "category 'sfx' volume must be in the range 0 to 1",
      "duplicate event id 'dup'",
      "event 'orphan' references unknown category 'voice'",
      "event 'bad' durationSeconds must be positive",
    ])
  })
})
