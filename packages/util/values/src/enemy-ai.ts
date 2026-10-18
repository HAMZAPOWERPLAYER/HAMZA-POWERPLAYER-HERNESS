/**
 * Enemy AI behavior model.
 *
 * Represents AI state machines, state transitions, and behavior validation for
 * enemy characters. All helpers are pure: they compute AI state transitions
 * from caller-supplied input, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/enemy-ai
 */

/** AI state types. */
export type AIState = 'idle' | 'patrol' | 'investigate' | 'chase' | 'attack' | 'retreat' | 'stun' | 'dead';

/** One AI state transition rule. */
export interface AITransition {
  /** Source state. */
  readonly from: AIState;
  /** Target state. */
  readonly to: AIState;
  /** Condition description. */
  readonly condition: string;
  /** Minimum time in source state before transition (seconds). */
  readonly minTime: number;
}

/** AI state configuration. */
export interface AIStateConfig {
  /** State id. */
  readonly id: AIState;
  /** Human-readable name. */
  readonly name: string;
  /** Whether the state can transition to attack. */
  readonly canAttack: boolean;
  /** Whether the state can chase. */
  readonly canChase: boolean;
  /** Whether the state can patrol. */
  readonly canPatrol: boolean;
}

/** AI configuration. */
export interface AIConfig {
  /** States in the state machine. */
  readonly states: readonly AIStateConfig[];
  /** Transitions between states. */
  readonly transitions: readonly AITransition[];
  /** Detection range (units). */
  readonly detectionRange: number;
  /** Attack range (units). */
  readonly attackRange: number;
  /** Patrol speed (units per second). */
  readonly patrolSpeed: number;
  /** Chase speed (units per second). */
  readonly chaseSpeed: number;
  /** Retreat speed (units per second). */
  readonly retreatSpeed: number;
  /** Attack cooldown (seconds). */
  readonly attackCooldown: number;
  /** Stun duration (seconds). */
  readonly stunDuration: number;
}

/** One AI state instance. */
export interface AIStateInstance {
  /** Current state. */
  readonly state: AIState;
  /** Time spent in current state (seconds). */
  readonly timeInState: number;
  /** Time since last attack (seconds). */
  readonly timeSinceLastAttack: number;
  /** Whether the enemy is stunned. */
  readonly stunned: boolean;
  /** Current target position, if any. */
  readonly targetPosition: readonly [number, number, number] | null;
  /** Current patrol waypoint index. */
  readonly patrolIndex: number;
  /** Patrol waypoints. */
  readonly patrolWaypoints: readonly [number, number, number][];
}

/** AI update result. */
export interface AIUpdateResult {
  /** New AI state instance. */
  readonly state: AIStateInstance;
  /** Whether the enemy attacked this frame. */
  readonly attacked: boolean;
  /** Whether the enemy changed state. */
  readonly stateChanged: boolean;
  /** Previous state. */
  readonly previousState: AIState | null;
  /** New target position, if changed. */
  readonly newTarget: readonly [number, number, number] | null;
}

/** Default AI configuration. */
export const DEFAULT_AI_CONFIG: AIConfig = {
  states: [
    { id: 'idle', name: 'Idle', canAttack: false, canChase: false, canPatrol: false },
    { id: 'patrol', name: 'Patrol', canAttack: false, canChase: false, canPatrol: true },
    { id: 'investigate', name: 'Investigate', canAttack: false, canChase: false, canPatrol: false },
    { id: 'chase', name: 'Chase', canAttack: true, canChase: true, canPatrol: false },
    { id: 'attack', name: 'Attack', canAttack: true, canChase: false, canPatrol: false },
    { id: 'retreat', name: 'Retreat', canAttack: false, canChase: false, canPatrol: false },
    { id: 'stun', name: 'Stun', canAttack: false, canChase: false, canPatrol: false },
    { id: 'dead', name: 'Dead', canAttack: false, canChase: false, canPatrol: false },
  ],
  transitions: [
    { from: 'idle', to: 'patrol', condition: 'patrol route assigned', minTime: 0 },
    { from: 'idle', to: 'investigate', condition: 'noise detected', minTime: 0 },
    { from: 'idle', to: 'chase', condition: 'player detected', minTime: 0 },
    { from: 'patrol', to: 'investigate', condition: 'noise detected', minTime: 0 },
    { from: 'patrol', to: 'chase', condition: 'player detected', minTime: 0 },
    { from: 'investigate', to: 'idle', condition: 'investigation complete', minTime: 2 },
    { from: 'investigate', to: 'chase', condition: 'player detected', minTime: 0 },
    { from: 'chase', to: 'attack', condition: 'in attack range', minTime: 0 },
    { from: 'chase', to: 'patrol', condition: 'player lost', minTime: 3 },
    { from: 'attack', to: 'chase', condition: 'attack cooldown complete', minTime: 0 },
    { from: 'attack', to: 'retreat', condition: 'health low', minTime: 0 },
    { from: 'retreat', to: 'idle', condition: 'safe distance reached', minTime: 0 },
    { from: 'retreat', to: 'chase', condition: 'health restored', minTime: 0 },
    { from: 'stun', to: 'idle', condition: 'stun duration complete', minTime: 0 },
    { from: 'stun', to: 'dead', condition: 'health zero', minTime: 0 },
    { from: 'retreat', to: 'dead', condition: 'health zero', minTime: 0 },
    { from: 'attack', to: 'dead', condition: 'health zero', minTime: 0 },
    { from: 'chase', to: 'dead', condition: 'health zero', minTime: 0 },
    { from: 'idle', to: 'dead', condition: 'health zero', minTime: 0 },
    { from: 'patrol', to: 'dead', condition: 'health zero', minTime: 0 },
    { from: 'investigate', to: 'dead', condition: 'health zero', minTime: 0 },
  ],
  detectionRange: 10.0,
  attackRange: 2.0,
  patrolSpeed: 2.0,
  chaseSpeed: 5.0,
  retreatSpeed: 4.0,
  attackCooldown: 1.5,
  stunDuration: 2.0,
};

/**
 * Create a default AI state instance.
 *
 * @param config - AI configuration supplying the initial attack cooldown.
 * @returns a new state instance in the idle state with the attack cooldown elapsed.
 */
export function createAIState(config: AIConfig): AIStateInstance {
  return {
    state: 'idle',
    timeInState: 0,
    timeSinceLastAttack: config.attackCooldown,
    stunned: false,
    targetPosition: null,
    patrolIndex: 0,
    patrolWaypoints: [],
  };
}

/**
 * Update AI state for one frame.
 *
 * @param state - current AI state instance.
 * @param config - AI configuration defining states, transitions, and ranges.
 * @param deltaTime - elapsed time in seconds, clamped to the range 0 to 0.1.
 * @param playerPosition - player world position, or null when the player is unknown.
 * @param enemyPosition - enemy world position.
 * @param canSeePlayer - whether the enemy currently sees the player.
 * @returns the updated state instance with attack, transition, and target outcomes.
 */
export function updateAI(
  state: AIStateInstance,
  config: AIConfig,
  deltaTime: number,
  playerPosition: readonly [number, number, number] | null,
  enemyPosition: readonly [number, number, number],
  canSeePlayer: boolean,
): AIUpdateResult {
  const dt = Math.max(0, Math.min(deltaTime, 0.1));
  const configState = config.states.find((s) => s.id === state.state);
  if (configState === undefined) {
    throw new Error(`unknown AI state: ${state.state}`);
  }

  let newState = state.state;
  let newTimeInState = state.timeInState + dt;
  let newTimeSinceLastAttack = state.timeSinceLastAttack + dt;
  let newStunned = state.stunned;
  let newTarget = state.targetPosition;
  let newPatrolIndex = state.patrolIndex;
  let attacked = false;
  let stateChanged = false;
  let previousState: AIState | null = null;

  // Handle stun
  if (newStunned) {
    if (newTimeInState >= config.stunDuration) {
      newStunned = false;
      newTimeInState = 0;
      newState = 'idle';
      stateChanged = true;
      previousState = 'stun';
    }
  }

  // Handle dead
  if (newState === 'dead') {
    return {
      state: { ...state, timeInState: newTimeInState },
      attacked: false,
      stateChanged: false,
      previousState: null,
      newTarget: null,
    };
  }

  // Check for state transitions
  const applicableTransitions = config.transitions.filter(
    (t) => t.from === state.state && newTimeInState >= t.minTime,
  );

  // Check distance to player
  let distanceToPlayer: number | null = null;
  if (playerPosition !== null) {
    const dx = playerPosition[0] - enemyPosition[0];
    const dy = playerPosition[1] - enemyPosition[1];
    const dz = playerPosition[2] - enemyPosition[2];
    distanceToPlayer = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Determine target state based on conditions
  let targetState: AIState | null = null;

  if (canSeePlayer && playerPosition !== null) {
    if (distanceToPlayer !== null && distanceToPlayer <= config.attackRange) {
      targetState = 'attack';
    } else {
      targetState = 'chase';
      newTarget = playerPosition;
    }
  } else if (state.state === 'chase' && newTimeInState > 3) {
    targetState = 'patrol';
  } else if (state.state === 'attack' && newTimeSinceLastAttack >= config.attackCooldown) {
    targetState = 'chase';
  } else if (state.state === 'attack' && distanceToPlayer !== null && distanceToPlayer > config.attackRange * 2) {
    targetState = 'retreat';
  }

  // Apply transition if valid
  if (targetState !== null && targetState !== state.state) {
    const validTransition = applicableTransitions.some((t) => t.to === targetState);
    if (validTransition) {
      previousState = state.state;
      newState = targetState;
      newTimeInState = 0;
      stateChanged = true;
    }
  }

  // Handle attack
  if (newState === 'attack' && newTimeSinceLastAttack >= config.attackCooldown && canSeePlayer) {
    attacked = true;
    newTimeSinceLastAttack = 0;
  }

  // Update patrol index
  if (newState === 'patrol' && state.patrolWaypoints.length > 0) {
    // Simple patrol: cycle through waypoints
    newPatrolIndex = (state.patrolIndex + 1) % state.patrolWaypoints.length;
    const wp = state.patrolWaypoints[newPatrolIndex];
    newTarget = wp ?? null;
  }

  const newStateInstance: AIStateInstance = {
    state: newState,
    timeInState: newTimeInState,
    timeSinceLastAttack: newTimeSinceLastAttack,
    stunned: newStunned,
    targetPosition: newTarget,
    patrolIndex: newPatrolIndex,
    patrolWaypoints: state.patrolWaypoints,
  };

  return {
    state: newStateInstance,
    attacked,
    stateChanged,
    previousState,
    newTarget,
  };
}

/**
 * Validate AI configuration.
 *
 * @param config - AI configuration to validate.
 * @returns descriptions of the problems found; empty when none were found.
 */
export function validateAIConfig(config: AIConfig): readonly string[] {
  const problems: string[] = [];
  if (config.states.length === 0) problems.push('at least one state is required');
  if (config.detectionRange <= 0) problems.push('detectionRange must be positive');
  if (config.attackRange <= 0) problems.push('attackRange must be positive');
  if (config.patrolSpeed <= 0) problems.push('patrolSpeed must be positive');
  if (config.chaseSpeed <= 0) problems.push('chaseSpeed must be positive');
  if (config.retreatSpeed <= 0) problems.push('retreatSpeed must be positive');
  if (config.attackCooldown <= 0) problems.push('attackCooldown must be positive');
  if (config.stunDuration <= 0) problems.push('stunDuration must be positive');

  const stateIds = new Set(config.states.map((s) => s.id));
  for (const transition of config.transitions) {
    if (!stateIds.has(transition.from)) problems.push(`transition from unknown state '${transition.from}'`);
    if (!stateIds.has(transition.to)) problems.push(`transition to unknown state '${transition.to}'`);
    if (transition.minTime < 0) problems.push(`transition minTime must be non-negative`);
  }

  const hasIdle = config.states.some((s) => s.id === 'idle');
  if (!hasIdle) problems.push('at least one idle state is recommended');

  return problems;
}
