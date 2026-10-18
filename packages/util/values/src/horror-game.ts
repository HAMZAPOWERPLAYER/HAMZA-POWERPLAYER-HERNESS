/**
 * Horror game development support.
 *
 * Provides models for horror atmosphere, threat behavior, and horror-game
 * reliability checks. All helpers are pure: they compute state transitions
 * and validate configurations from caller-supplied input, perform no I/O, and
 * hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/horror-game
 */

/** Atmosphere state for horror games. */
export interface HorrorAtmosphere {
  /** Current tension level (0 to 1). */
  readonly tension: number;
  /** Current fear level (0 to 1). */
  readonly fear: number;
  /** Current lighting level (0 to 1, 0 = dark). */
  readonly lighting: number;
  /** Current audio intensity (0 to 1). */
  readonly audioIntensity: number;
  /** Whether the player is in a safe area. */
  readonly safeArea: boolean;
  /** Current ambient sound. */
  readonly ambientSound: string | null;
}

/** Atmosphere update result. */
export interface AtmosphereUpdate {
  /** New atmosphere state. */
  readonly state: HorrorAtmosphere;
  /** Whether tension changed. */
  readonly tensionChanged: boolean;
  /** Whether fear changed. */
  readonly fearChanged: boolean;
}

/**
 * Update horror atmosphere for one frame.
 *
 * @param state - current atmosphere state.
 * @param deltaTime - elapsed frame time in seconds, clamped to 0 to 0.1.
 * @param playerInDanger - whether the player is in danger.
 * @param nearbyThreat - whether a threat is nearby.
 * @param safeArea - whether the player is in a safe area.
 * @returns the updated atmosphere, plus whether tension and fear each changed by more than 0.001.
 */
export function updateHorrorAtmosphere(
  state: HorrorAtmosphere,
  deltaTime: number,
  playerInDanger: boolean,
  nearbyThreat: boolean,
  safeArea: boolean,
): AtmosphereUpdate {
  const dt = Math.max(0, Math.min(deltaTime, 0.1));
  let newTension = state.tension;
  let newFear = state.fear;
  let newLighting = state.lighting;
  let newAudio = state.audioIntensity;
  let newSafeArea = safeArea;

  // Tension increases when near threat or in danger
  if (nearbyThreat || playerInDanger) {
    newTension = Math.min(1, newTension + dt * 0.5);
  } else {
    newTension = Math.max(0, newTension - dt * 0.2);
  }

  // Fear increases with tension and darkness
  if (newTension > 0.5) {
    newFear = Math.min(1, newFear + dt * 0.3);
  } else {
    newFear = Math.max(0, newFear - dt * 0.1);
  }

  // Lighting decreases with tension
  if (newTension > 0.7) {
    newLighting = Math.max(0, newLighting - dt * 0.3);
  } else if (newLighting < 1) {
    newLighting = Math.min(1, newLighting + dt * 0.1);
  }

  // Audio intensity follows tension
  newAudio = Math.min(1, newTension * 0.8 + 0.2);

  const tensionChanged = Math.abs(newTension - state.tension) > 0.001;
  const fearChanged = Math.abs(newFear - state.fear) > 0.001;

  return {
    state: {
      tension: newTension,
      fear: newFear,
      lighting: newLighting,
      audioIntensity: newAudio,
      safeArea: newSafeArea,
      ambientSound: state.ambientSound,
    },
    tensionChanged,
    fearChanged,
  };
}

/** Threat behavior state. */
export interface ThreatState {
  /** Threat identifier. */
  readonly id: string;
  /** Current behavior state. */
  readonly state: 'idle' | 'detecting' | 'pursuing' | 'attacking' | 'searching' | 'retreat' | 'dead';
  /** Current position (x, y, z). */
  readonly position: readonly [number, number, number];
  /** Detection range (units). */
  readonly detectionRange: number;
  /** Attack range (units). */
  readonly attackRange: number;
  /** Current target position, if any. */
  readonly targetPosition: readonly [number, number, number] | null;
  /** Time since last attack (seconds). */
  readonly timeSinceLastAttack: number;
  /** Whether the threat is active. */
  readonly active: boolean;
}

/** Threat update result. */
export interface ThreatUpdate {
  /** New threat state. */
  readonly state: ThreatState;
  /** Whether the threat attacked this frame. */
  readonly attacked: boolean;
  /** Whether the threat detected the player. */
  readonly detectedPlayer: boolean;
}

/** Default threat configuration. */
export interface ThreatConfig {
  /** Detection range (units). */
  readonly detectionRange: number;
  /** Attack range (units). */
  readonly attackRange: number;
  /** Movement speed (units per second). */
  readonly moveSpeed: number;
  /** Attack cooldown (seconds). */
  readonly attackCooldown: number;
  /** Pursuit speed (units per second). */
  readonly pursuitSpeed: number;
}

/** Default threat config. */
export const DEFAULT_THREAT_CONFIG: ThreatConfig = {
  detectionRange: 12.0,
  attackRange: 2.5,
  moveSpeed: 3.5,
  attackCooldown: 2.0,
  pursuitSpeed: 5.0,
};

/**
 * Update threat behavior for one frame.
 *
 * @param state - current threat state.
 * @param config - threat ranges, speeds, and attack cooldown to apply.
 * @param deltaTime - elapsed frame time in seconds, clamped to 0 to 0.1.
 * @param playerPosition - player position, or null when unknown.
 * @param canSeePlayer - whether the player is within line of sight.
 * @returns the updated threat state, plus whether the threat attacked and detected the player this frame.
 */
export function updateThreat(
  state: ThreatState,
  config: ThreatConfig,
  deltaTime: number,
  playerPosition: readonly [number, number, number] | null,
  canSeePlayer: boolean,
): ThreatUpdate {
  const dt = Math.max(0, Math.min(deltaTime, 0.1));
  let newState = state.state;
  let newTarget = state.targetPosition;
  let newTimeSinceLastAttack = state.timeSinceLastAttack + dt;
  let attacked = false;
  let detectedPlayer = false;

  // Default state: idle
  if (!state.active) {
    return {
      state: { ...state, timeSinceLastAttack: newTimeSinceLastAttack },
      attacked: false,
      detectedPlayer: false,
    };
  }

  // Check player detection
  let distanceToPlayer: number | null = null;
  if (playerPosition !== null) {
    const dx = playerPosition[0] - state.position[0];
    const dy = playerPosition[1] - state.position[1];
    const dz = playerPosition[2] - state.position[2];
    distanceToPlayer = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  if (canSeePlayer && playerPosition !== null && distanceToPlayer !== null && distanceToPlayer <= config.detectionRange) {
    detectedPlayer = true;
    newTarget = playerPosition;
  }

  // State transitions
  if (newState === 'idle') {
    if (detectedPlayer) {
      newState = 'pursuing';
    }
  } else if (newState === 'detecting') {
    if (detectedPlayer) {
      newState = 'pursuing';
    } else if (newTimeInState(state) > 3) {
      newState = 'idle';
      newTarget = null;
    }
  } else if (newState === 'pursuing') {
    if (detectedPlayer) {
      newTarget = playerPosition;
      if (distanceToPlayer !== null && distanceToPlayer <= config.attackRange) {
        newState = 'attacking';
      }
    } else if (newTimeInState(state) > 5) {
      newState = 'searching';
    }
  } else if (newState === 'searching') {
    if (detectedPlayer) {
      newState = 'pursuing';
      newTarget = playerPosition;
    } else if (newTimeInState(state) > 5) {
      newState = 'idle';
      newTarget = null;
    }
  } else if (newState === 'attacking') {
    if (detectedPlayer && distanceToPlayer !== null && distanceToPlayer > config.attackRange) {
      newState = 'pursuing';
      newTarget = playerPosition;
    } else if (newTimeSinceLastAttack >= config.attackCooldown && detectedPlayer) {
      attacked = true;
      newTimeSinceLastAttack = 0;
    }
  } else if (newState === 'retreat') {
    if (detectedPlayer) {
      newState = 'pursuing';
      newTarget = playerPosition;
    }
  }

  const newThreatState: ThreatState = {
    id: state.id,
    state: newState,
    position: state.position,
    detectionRange: config.detectionRange,
    attackRange: config.attackRange,
    targetPosition: newTarget,
    timeSinceLastAttack: newTimeSinceLastAttack,
    active: state.active,
  };

  return {
    state: newThreatState,
    attacked,
    detectedPlayer,
  };
}

/** Helper: time since state entered (placeholder; in real usage track entry time). */
function newTimeInState(state: ThreatState): number {
  return state.timeSinceLastAttack; // placeholder: reuse timeSinceLastAttack as time in state
}

/**
 * Validate threat configuration.
 *
 * @param config - threat configuration to validate.
 * @returns one message per invalid value, empty when the configuration is valid.
 */
export function validateThreatConfig(config: ThreatConfig): readonly string[] {
  const problems: string[] = [];
  if (config.detectionRange <= 0) problems.push('detectionRange must be positive');
  if (config.attackRange <= 0) problems.push('attackRange must be positive');
  if (config.moveSpeed <= 0) problems.push('moveSpeed must be positive');
  if (config.attackCooldown <= 0) problems.push('attackCooldown must be positive');
  if (config.pursuitSpeed <= 0) problems.push('pursuitSpeed must be positive');
  if (config.attackRange > config.detectionRange) {
    problems.push('attackRange should not exceed detectionRange');
  }
  return problems;
}

/**
 * Create a default threat state.
 *
 * @param id - threat identifier.
 * @param position - initial threat position (x, y, z).
 * @param config - threat configuration supplying detection and attack ranges.
 * @returns an active, idle threat with no target and its attack cooldown elapsed.
 */
export function createThreatState(
  id: string,
  position: readonly [number, number, number],
  config: ThreatConfig,
): ThreatState {
  return {
    id,
    state: 'idle',
    position,
    detectionRange: config.detectionRange,
    attackRange: config.attackRange,
    targetPosition: null,
    timeSinceLastAttack: config.attackCooldown,
    active: true,
  };
}
