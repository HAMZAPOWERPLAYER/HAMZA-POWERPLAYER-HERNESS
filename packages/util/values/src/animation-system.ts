/**
 * Animation system model.
 *
 * Represents animation states, transitions, and playback state for game
 * characters and objects. All helpers are pure: they compute animation state
 * transitions from caller-supplied input, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/animation-system
 */

/** One animation clip. */
export interface AnimationClip {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Duration in seconds. */
  readonly duration: number;
  /** Whether the animation loops. */
  readonly loop: boolean;
  /** Whether the animation uses root motion. */
  readonly rootMotion: boolean;
}

/** Animation state. */
export interface AnimationState {
  /** Current animation clip id, or null. */
  readonly currentClip: string | null;
  /** Current playback time in seconds. */
  readonly time: number;
  /** Whether the animation is playing. */
  readonly playing: boolean;
  /** Current playback speed multiplier. */
  readonly speed: number;
  /** Whether the animation has finished playing (non-looping). */
  readonly finished: boolean;
  /** Crossfade target, if any. */
  readonly crossfadeTarget: string | null;
  /** Crossfade progress (0 to 1). */
  readonly crossfadeProgress: number;
}

/** Animation transition rule. */
export interface AnimationTransition {
  /** Source clip id. */
  readonly from: string;
  /** Target clip id. */
  readonly to: string;
  /** Condition description. */
  readonly condition: string;
  /** Crossfade duration (seconds). */
  readonly crossfadeDuration: number;
  /** Minimum time in source state before transition (seconds). */
  readonly minTime: number;
}

/** Animation configuration. */
export interface AnimationConfig {
  /** Available animation clips. */
  readonly clips: readonly AnimationClip[];
  /** Transitions between clips. */
  readonly transitions: readonly AnimationTransition[];
  /** Default crossfade duration (seconds). */
  readonly defaultCrossfadeDuration: number;
  /** Default playback speed. */
  readonly defaultSpeed: number;
}

/** Default animation config. */
export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  clips: [],
  transitions: [],
  defaultCrossfadeDuration: 0.2,
  defaultSpeed: 1.0,
};

/**
 * Create an animation state from a clip.
 *
 * @param clipId - initial clip id, or null for no clip.
 * @param config - animation configuration supplying the default playback speed.
 * @returns animation state at time zero; playing when clipId is non-null.
 */
export function createAnimationState(
  clipId: string | null,
  config: AnimationConfig,
): AnimationState {
  return {
    currentClip: clipId,
    time: 0,
    playing: clipId !== null,
    speed: config.defaultSpeed,
    finished: false,
    crossfadeTarget: null,
    crossfadeProgress: 0,
  };
}

/**
 * Update animation state for one frame.
 *
 * @param state - animation state to advance.
 * @param config - animation configuration supplying the clips.
 * @param deltaTime - elapsed frame time in seconds, clamped to the range 0 to 0.1.
 * @param targetClip - clip id to begin crossfading to, or null to keep the current clip.
 * @returns next animation state with updated time, playback, and crossfade progress.
 */
export function updateAnimation(
  state: AnimationState,
  config: AnimationConfig,
  deltaTime: number,
  targetClip: string | null,
): AnimationState {
  const dt = Math.max(0, Math.min(deltaTime, 0.1));
  let newState = { ...state };
  let newTime = state.time;
  let newPlaying = state.playing;
  let newFinished = state.finished;
  let newCrossfadeTarget = state.crossfadeTarget;
  let newCrossfadeProgress = state.crossfadeProgress;

  // Handle crossfade
  if (newCrossfadeTarget !== null && newCrossfadeProgress < 1) {
    newCrossfadeProgress = Math.min(1, newCrossfadeProgress + dt / state.speed / (newCrossfadeTarget === state.currentClip ? 0.1 : state.speed));
    if (newCrossfadeProgress >= 1) {
      newState.currentClip = newCrossfadeTarget;
      newCrossfadeTarget = null;
      newCrossfadeProgress = 0;
    }
  }

  // Handle clip change
  if (targetClip !== null && targetClip !== newState.currentClip && newCrossfadeTarget === null) {
    const clip = config.clips.find((c) => c.id === targetClip);
    if (clip !== undefined) {
      newCrossfadeTarget = targetClip;
      newCrossfadeProgress = 0;
      newTime = 0;
    }
  }

  // Advance time
  if (newPlaying && newState.currentClip !== null) {
    newTime = state.time + dt * state.speed;
    const clip = config.clips.find((c) => c.id === newState.currentClip);
    if (clip !== undefined && !clip.loop && newTime >= clip.duration) {
      newTime = clip.duration;
      newFinished = true;
      newPlaying = false;
    }
  }

  newState = {
    ...newState,
    time: newTime,
    playing: newPlaying,
    finished: newFinished,
    crossfadeTarget: newCrossfadeTarget,
    crossfadeProgress: newCrossfadeProgress,
  };

  return newState;
}

/**
 * Crossfade to a new clip.
 *
 * @param state - animation state to start the crossfade from.
 * @param targetClip - clip id to crossfade to.
 * @param _duration - requested crossfade duration in seconds; unused, updateAnimation derives progress from frame deltas.
 * @returns animation state with the crossfade target set and progress reset to zero.
 */
export function crossfadeTo(
  state: AnimationState,
  targetClip: string,
  _duration: number,
): AnimationState {
  return {
    ...state,
    crossfadeTarget: targetClip,
    crossfadeProgress: 0,
    // Crossfade duration is handled in updateAnimation via dt
  };
}

/**
 * Validate animation config.
 *
 * @param config - animation configuration to check.
 * @returns problem descriptions; empty when the configuration is valid.
 */
export function validateAnimationConfig(config: AnimationConfig): readonly string[] {
  const problems: string[] = [];
  const clipIds = new Set(config.clips.map((c) => c.id));

  for (const clip of config.clips) {
    if (clip.duration <= 0) problems.push(`clip '${clip.id}' duration must be positive`);
  }

  for (const transition of config.transitions) {
    if (!clipIds.has(transition.from)) problems.push(`transition from unknown clip '${transition.from}'`);
    if (!clipIds.has(transition.to)) problems.push(`transition to unknown clip '${transition.to}'`);
    if (transition.crossfadeDuration < 0) problems.push(`transition crossfadeDuration must be non-negative`);
    if (transition.minTime < 0) problems.push(`transition minTime must be non-negative`);
  }

  if (config.defaultCrossfadeDuration < 0) problems.push('defaultCrossfadeDuration must be non-negative');
  if (config.defaultSpeed <= 0) problems.push('defaultSpeed must be positive');

  return problems;
}

/**
 * Get the current clip.
 *
 * @param state - animation state whose current clip id is read.
 * @param config - animation configuration supplying the clips.
 * @returns current clip, or null when no clip is set or the clip id is not configured.
 */
export function getCurrentClip(state: AnimationState, config: AnimationConfig): AnimationClip | null {
  if (state.currentClip === null) return null;
  return config.clips.find((c) => c.id === state.currentClip) ?? null;
}

/**
 * Check if animation is looping.
 *
 * @param state - animation state whose current clip is read.
 * @param config - animation configuration supplying the clips.
 * @returns whether the current clip loops; false when there is no current clip.
 */
export function isAnimationLooping(state: AnimationState, config: AnimationConfig): boolean {
  const clip = getCurrentClip(state, config);
  return clip !== null && clip.loop;
}
