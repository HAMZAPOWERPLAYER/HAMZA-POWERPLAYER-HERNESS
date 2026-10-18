/**
 * Game audio model.
 *
 * Represents audio categories, an event catalog, and playback state (active
 * voices and per-event playback times) for game audio. All helpers are pure:
 * they compute playback decisions and state transitions from caller-supplied
 * input, perform no I/O, hold no state, and take every timestamp as an
 * explicit parameter in seconds.
 *
 * @module @deepseek-ai/dsh-util-values/game-audio
 */

/** Mix settings for one audio category. */
export interface AudioCategory {
  /** Category volume in the range 0 to 1. */
  readonly volume: number;
  /** Whether the category is muted. */
  readonly muted: boolean;
}

/** Category mix settings keyed by category id, so duplicate category ids are unrepresentable. */
export type AudioCategories = Readonly<Record<string, AudioCategory>>;

/** One audio event catalog entry. */
export interface AudioEvent {
  /** Event identifier, unique within the catalog. */
  readonly id: string;
  /** Category id that controls the event's volume and mute flag. */
  readonly category: string;
  /** Whether the event keeps playing until stopped instead of running for a fixed duration. */
  readonly looping: boolean;
  /** Whether playback is positioned in space. */
  readonly spatial: boolean;
  /** Minimum seconds between two playbacks; absent means no cooldown. */
  readonly cooldownSeconds?: number;
  /** Playback length in seconds for a non-looping event; required for such events and ignored while looping. */
  readonly durationSeconds?: number;
}

/** Ordered event catalog resolved by event id; `validateAudioCatalog` reports duplicate ids. */
export type AudioCatalog = readonly AudioEvent[];

/** One active playback voice. */
export interface AudioVoice {
  /** Identifier of the event that started the voice. */
  readonly eventId: string;
  /** Category id the voice was started under, used to stop voices by category. */
  readonly category: string;
  /** Start time in seconds supplied when playback began. */
  readonly startedAt: number;
  /** Seconds remaining before a one-shot voice expires; null while a looping voice plays. */
  readonly remainingSeconds: number | null;
}

/** Playback state. */
export interface AudioPlaybackState {
  /** Currently active voices, in start order. */
  readonly voices: readonly AudioVoice[];
  /** Last playback start time in seconds per event id; an event is absent until it first plays, and its entry persists after the voice stops. */
  readonly lastPlayedAt: Readonly<Record<string, number>>;
}

/** Outcome of a playback request. */
export interface AudioPlaybackDecision {
  /** Playback state after the request; identical to the input state when playback was rejected. */
  readonly state: AudioPlaybackState;
  /** Whether a voice was started. */
  readonly played: boolean;
  /** Rejection reason, or null when playback started. */
  readonly reason: string | null;
}

/**
 * Create an empty playback state.
 *
 * @returns playback state with no active voices and no playback history.
 */
export function createAudioState(): AudioPlaybackState {
  return { voices: [], lastPlayedAt: {} };
}

/**
 * Request playback of one catalog event.
 *
 * Rejection checks run in this order: unknown event, event referencing an
 * unknown category, muted category, zero or negative category volume, cooldown
 * not yet elapsed, already-active looping voice, and on a non-looping event a
 * missing or non-positive `durationSeconds`. A rejected request returns the
 * input state unchanged.
 *
 * @param state - current playback state.
 * @param catalog - event catalog to resolve the event id against.
 * @param categories - category mix settings keyed by category id.
 * @param eventId - id of the event to play.
 * @param atSeconds - current time in seconds, used for the cooldown check and recorded for the new voice.
 * @returns decision carrying the resulting state, `played`, and `reason`, which is null exactly when a voice started.
 */
export function requestPlayback(
  state: AudioPlaybackState,
  catalog: AudioCatalog,
  categories: AudioCategories,
  eventId: string,
  atSeconds: number,
): AudioPlaybackDecision {
  const event = catalog.find((candidate) => candidate.id === eventId);
  if (event === undefined) {
    return { state, played: false, reason: `unknown event '${eventId}'` };
  }

  const category = categories[event.category];
  if (category === undefined) {
    return {
      state,
      played: false,
      reason: `event '${eventId}' references unknown category '${event.category}'`,
    };
  }
  if (category.muted) {
    return { state, played: false, reason: `category '${event.category}' is muted` };
  }
  if (!(category.volume > 0)) {
    return { state, played: false, reason: `category '${event.category}' volume is zero` };
  }

  const cooldown = event.cooldownSeconds;
  const lastPlayedAt = state.lastPlayedAt[eventId];
  if (cooldown !== undefined && lastPlayedAt !== undefined && atSeconds - lastPlayedAt < cooldown) {
    return { state, played: false, reason: `event '${eventId}' is on cooldown` };
  }

  if (event.looping && state.voices.some((voice) => voice.eventId === eventId && voice.remainingSeconds === null)) {
    return { state, played: false, reason: `event '${eventId}' is already playing` };
  }

  let remainingSeconds: number | null;
  if (event.looping) {
    remainingSeconds = null;
  } else if (event.durationSeconds === undefined) {
    return { state, played: false, reason: `event '${eventId}' has no durationSeconds` };
  } else if (!(event.durationSeconds > 0)) {
    return { state, played: false, reason: `event '${eventId}' durationSeconds must be positive` };
  } else {
    remainingSeconds = event.durationSeconds;
  }

  const voice: AudioVoice = {
    eventId,
    category: event.category,
    startedAt: atSeconds,
    remainingSeconds,
  };
  return {
    state: {
      voices: [...state.voices, voice],
      lastPlayedAt: { ...state.lastPlayedAt, [eventId]: atSeconds },
    },
    played: true,
    reason: null,
  };
}

/**
 * Stop every active voice of one event.
 *
 * Playback history in `lastPlayedAt` is kept, so cooldowns continue to apply
 * after the voices stop.
 *
 * @param state - current playback state.
 * @param eventId - id of the event whose voices stop.
 * @returns state without voices of the event, or the input state unchanged when none is active.
 */
export function stopPlayback(state: AudioPlaybackState, eventId: string): AudioPlaybackState {
  const voices = state.voices.filter((voice) => voice.eventId !== eventId);
  if (voices.length === state.voices.length) {
    return state;
  }
  return { ...state, voices };
}

/**
 * Stop every active voice of one category.
 *
 * Playback history in `lastPlayedAt` is kept, so cooldowns continue to apply
 * after the voices stop.
 *
 * @param state - current playback state.
 * @param category - category id whose voices stop.
 * @returns state without voices of the category, or the input state unchanged when none is active.
 */
export function stopByCategory(state: AudioPlaybackState, category: string): AudioPlaybackState {
  const voices = state.voices.filter((voice) => voice.category !== category);
  if (voices.length === state.voices.length) {
    return state;
  }
  return { ...state, voices };
}

/**
 * Advance playback time and expire one-shot voices.
 *
 * A one-shot voice expires when its remaining time reaches zero at the end of
 * the step; a looping voice (`remainingSeconds` null) is kept unchanged. A
 * negative `dtSeconds` is treated as zero.
 *
 * @param state - current playback state.
 * @param dtSeconds - elapsed time in seconds since the previous step.
 * @returns state with one-shot voices decremented and expired voices removed, or the input state unchanged when the step advances nothing.
 */
export function advanceAudio(state: AudioPlaybackState, dtSeconds: number): AudioPlaybackState {
  const dt = Math.max(0, dtSeconds);
  if (dt === 0 || state.voices.every((voice) => voice.remainingSeconds === null)) {
    return state;
  }

  const voices: AudioVoice[] = [];
  for (const voice of state.voices) {
    if (voice.remainingSeconds === null) {
      voices.push(voice);
      continue;
    }
    const remaining = voice.remainingSeconds - dt;
    if (remaining > 0) {
      voices.push({ ...voice, remainingSeconds: remaining });
    }
  }
  return { ...state, voices };
}

/**
 * Validate an audio catalog against the available categories.
 *
 * Besides the required checks (category volume outside 0 to 1, duplicate event
 * ids, and events referencing an unknown category), this reports a non-looping
 * event without `durationSeconds`, a non-positive `durationSeconds`, and a
 * non-positive `cooldownSeconds`. Category issues come first in ascending
 * category id order, then event issues in catalog order; within one event the
 * checks run in the order: duplicate id, unknown category, `durationSeconds`,
 * `cooldownSeconds`.
 *
 * @param catalog - event catalog to check.
 * @param categories - category mix settings keyed by category id.
 * @returns one message per problem found, empty when the catalog is valid.
 */
export function validateAudioCatalog(catalog: AudioCatalog, categories: AudioCategories): readonly string[] {
  const issues: string[] = [];
  const categoryEntries = Object.entries(categories).sort(([left], [right]) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });

  for (const [categoryId, category] of categoryEntries) {
    if (!(category.volume >= 0 && category.volume <= 1)) {
      issues.push(`category '${categoryId}' volume must be in the range 0 to 1`);
    }
  }

  const seenIds = new Set<string>();
  for (const event of catalog) {
    if (seenIds.has(event.id)) {
      issues.push(`duplicate event id '${event.id}'`);
    } else {
      seenIds.add(event.id);
    }

    if (categories[event.category] === undefined) {
      issues.push(`event '${event.id}' references unknown category '${event.category}'`);
    }

    if (event.durationSeconds === undefined) {
      if (!event.looping) {
        issues.push(`event '${event.id}' is not looping and has no durationSeconds`);
      }
    } else if (!(event.durationSeconds > 0)) {
      issues.push(`event '${event.id}' durationSeconds must be positive`);
    }

    if (event.cooldownSeconds !== undefined && !(event.cooldownSeconds > 0)) {
      issues.push(`event '${event.id}' cooldownSeconds must be positive`);
    }
  }

  return issues;
}
