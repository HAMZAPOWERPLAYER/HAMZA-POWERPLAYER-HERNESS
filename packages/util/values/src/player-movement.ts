/**
 * Player movement model.
 *
 * Represents movement state, input state, and movement validation for game
 * characters. All helpers are pure: they compute movement state transitions
 * from caller-supplied input, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/player-movement
 */

/** Movement state of a character. */
export interface MovementState {
  /** Current position (x, y, z). */
  readonly position: readonly [number, number, number];
  /** Current velocity (x, y, z). */
  readonly velocity: readonly [number, number, number];
  /** Current facing direction (x, y, z, normalized). */
  readonly facing: readonly [number, number, number];
  /** Whether the character is grounded. */
  readonly grounded: boolean;
  /** Whether the character is sprinting. */
  readonly sprinting: boolean;
  /** Whether the character is crouching. */
  readonly crouching: boolean;
  /** Current movement speed multiplier. */
  readonly speedMultiplier: number;
}

/** Input state for movement. */
export interface MovementInput {
  /** Forward/backward axis (-1 to 1). */
  readonly forward: number;
  /** Strafe left/right axis (-1 to 1). */
  readonly strafe: number;
  /** Jump pressed this frame. */
  readonly jumpPressed: boolean;
  /** Sprint toggle. */
  readonly sprint: boolean;
  /** Crouch toggle. */
  readonly crouch: boolean;
}

/** Movement configuration. */
export interface MovementConfig {
  /** Base movement speed (units per second). */
  readonly baseSpeed: number;
  /** Sprint speed multiplier. */
  readonly sprintMultiplier: number;
  /** Crouch speed multiplier. */
  readonly crouchMultiplier: number;
  /** Jump impulse (units per second). */
  readonly jumpImpulse: number;
  /** Gravity (units per second squared). */
  readonly gravity: number;
  /** Ground friction. */
  readonly groundFriction: number;
  /** Air control factor (0 to 1). */
  readonly airControl: number;
  /** Max ground speed. */
  readonly maxGroundSpeed: number;
  /** Max air speed. */
  readonly maxAirSpeed: number;
}

/** Movement update result. */
export interface MovementResult {
  /** New movement state. */
  readonly state: MovementState;
  /** Whether the character jumped. */
  readonly jumped: boolean;
  /** Whether the character collided with a wall. */
  readonly wallCollision: boolean;
  /** Whether the character is grounded after the update. */
  readonly grounded: boolean;
}

/** Default movement configuration. */
export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  baseSpeed: 5.0,
  sprintMultiplier: 1.5,
  crouchMultiplier: 0.5,
  jumpImpulse: 8.0,
  gravity: -25.0,
  groundFriction: 8.0,
  airControl: 0.3,
  maxGroundSpeed: 10.0,
  maxAirSpeed: 6.0,
};

/** Viewpoint a movement preset is tuned for. */
export type MovementPreset = 'first-person' | 'third-person' | 'top-down' | 'platformer';

/**
 * Complete movement configuration for each {@link MovementPreset}.
 *
 * Every entry is a full {@link MovementConfig} rather than a partial overlay, so
 * a preset is usable on its own and passes {@link validateMovementConfig} as
 * published. Callers adjust single fields through {@link resolveMovementConfig}.
 */
export const MOVEMENT_PRESETS: Readonly<Record<MovementPreset, MovementConfig>> = {
  /** Camera-height movement: default speeds with mid-air steering for look-driven aiming. */
  'first-person': {
    baseSpeed: 5.0,
    sprintMultiplier: 1.5,
    crouchMultiplier: 0.5,
    jumpImpulse: 8.0,
    gravity: -25.0,
    groundFriction: 8.0,
    airControl: 0.4,
    maxGroundSpeed: 10.0,
    maxAirSpeed: 6.0,
  },
  /**
   * Camera trailing the character: a slightly lower base speed with stronger
   * air steering so jumps can correct toward the camera-facing direction.
   */
  'third-person': {
    baseSpeed: 4.5,
    sprintMultiplier: 1.6,
    crouchMultiplier: 0.5,
    jumpImpulse: 8.0,
    gravity: -25.0,
    groundFriction: 6.0,
    airControl: 0.5,
    maxGroundSpeed: 9.0,
    maxAirSpeed: 5.0,
  },
  /**
   * Planar movement: `validateMovementConfig` requires a positive jump impulse,
   * so this preset pairs a small impulse with strong gravity, keeping hops close
   * to the ground plane, and allows full air steering at ground speed.
   */
  'top-down': {
    baseSpeed: 6.0,
    sprintMultiplier: 1.4,
    crouchMultiplier: 0.6,
    jumpImpulse: 4.0,
    gravity: -50.0,
    groundFriction: 10.0,
    airControl: 1.0,
    maxGroundSpeed: 12.0,
    maxAirSpeed: 12.0,
  },
  /** Side-view arcs: a strong jump with snappy ground stops and air steering for jump correction. */
  platformer: {
    baseSpeed: 6.0,
    sprintMultiplier: 1.25,
    crouchMultiplier: 0.5,
    jumpImpulse: 12.0,
    gravity: -40.0,
    groundFriction: 12.0,
    airControl: 0.6,
    maxGroundSpeed: 8.0,
    maxAirSpeed: 8.0,
  },
};

/**
 * Resolve a movement configuration from a perspective preset.
 *
 * @param preset - preset whose values form the base of the result.
 * @param overrides - fields to replace; omitted fields keep the preset value.
 * @returns the preset merged over {@link DEFAULT_MOVEMENT_CONFIG}, with `overrides` applied last.
 */
export function resolveMovementConfig(
  preset: MovementPreset,
  overrides?: Partial<MovementConfig>,
): MovementConfig {
  return { ...DEFAULT_MOVEMENT_CONFIG, ...MOVEMENT_PRESETS[preset], ...overrides };
}

/** Optional per-frame behavior for {@link updateMovement}. */
export interface MovementUpdateOptions {
  /**
   * Whether to skip simulating the frame.
   *
   * A paused call returns the input state object as-is, so velocity and every
   * other field carry over unchanged to the frame that resumes.
   */
  readonly paused?: boolean;
}

/**
 * Update movement state for one frame.
 *
 * With `{ paused: true }` the frame is skipped: the input `state` object is
 * returned as-is, so position, velocity, facing, `grounded`, and every flag are
 * preserved exactly, while `jumped` and `wallCollision` report `false`.
 *
 * @param state - current movement state.
 * @param input - movement input for the frame.
 * @param config - movement configuration.
 * @param deltaTime - elapsed time (seconds); clamped to at most 0.1.
 * @param options - optional per-frame behavior; omit for a normal simulated frame.
 * @returns the updated state with whether the character jumped, hit a wall, and is grounded; a paused call returns the input state unchanged with `jumped: false` and `wallCollision: false`.
 */
export function updateMovement(
  state: MovementState,
  input: MovementInput,
  config: MovementConfig,
  deltaTime: number,
  options?: MovementUpdateOptions,
): MovementResult {
  if (options?.paused === true) {
    return {
      state,
      jumped: false,
      wallCollision: false,
      grounded: state.grounded,
    };
  }
  const dt = Math.max(0, Math.min(deltaTime, 0.1)); // clamp delta time
  const speedMultiplier = input.sprint ? config.sprintMultiplier : input.crouch ? config.crouchMultiplier : 1.0;
  const targetSpeed = Math.min(config.baseSpeed * speedMultiplier, config.maxGroundSpeed);

  // Compute movement direction from input
  const forward: readonly [number, number, number] = [state.facing[0], 0, state.facing[2]];
  const forwardLen = Math.sqrt(forward[0] ** 2 + forward[2] ** 2);
  const normalizedForward: readonly [number, number, number] = forwardLen > 0
    ? [forward[0] / forwardLen, 0, forward[2] / forwardLen]
    : [0, 0, 1];

  const right: readonly [number, number, number] = [-normalizedForward[2], 0, normalizedForward[0]];

  let moveX = input.forward * normalizedForward[0] + input.strafe * right[0];
  let moveZ = input.forward * normalizedForward[2] + input.strafe * right[2];
  const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (moveLen > 1) {
    moveX /= moveLen;
    moveZ /= moveLen;
  }

  // Apply movement
  let velX = moveX * targetSpeed;
  let velZ = moveZ * targetSpeed;

  // Apply gravity
  let velY = state.velocity[1] + config.gravity * dt;

  // Grounded logic
  let newGrounded = state.grounded;
  if (newGrounded) {
    velY = Math.min(velY, 0); // don't accumulate downward velocity while grounded
    if (input.jumpPressed) {
      velY = config.jumpImpulse;
      newGrounded = false;
    }
  } else {
    // Air control
    velX += moveX * config.airControl * targetSpeed * dt;
    velZ += moveZ * config.airControl * targetSpeed * dt;
    // Clamp air speed
    const airSpeed = Math.sqrt(velX * velX + velZ * velZ);
    if (airSpeed > config.maxAirSpeed) {
      const scale = config.maxAirSpeed / airSpeed;
      velX *= scale;
      velZ *= scale;
    }
  }

  // Apply friction while grounded
  if (newGrounded) {
    const friction = 1 - config.groundFriction * dt;
    velX *= Math.max(0, friction);
    velZ *= Math.max(0, friction);
  }

  // Update position
  const newPos: [number, number, number] = [
    state.position[0] + velX * dt,
    state.position[1] + velY * dt,
    state.position[2] + velZ * dt,
  ];

  // Ground check: simple ground at y = 0
  let wallCollision = false;
  if (newPos[1] <= 0) {
    newPos[1] = 0;
    velY = 0;
    newGrounded = true;
  }

  // Update facing if moving
  let newFacing: readonly [number, number, number] = state.facing;
  if (Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01) {
    newFacing = [moveX, 0, moveZ];
    const fLen = Math.sqrt(newFacing[0] ** 2 + newFacing[2] ** 2);
    if (fLen > 0) {
      newFacing = [newFacing[0] / fLen, 0, newFacing[2] / fLen];
    }
  }

  const newState: MovementState = {
    position: newPos,
    velocity: [velX, velY, velZ],
    facing: newFacing,
    grounded: newGrounded,
    sprinting: input.sprint,
    crouching: input.crouch,
    speedMultiplier,
  };

  return {
    state: newState,
    jumped: input.jumpPressed && state.grounded && !newGrounded,
    wallCollision,
    grounded: newGrounded,
  };
}

/**
 * Validate movement configuration.
 *
 * @param config - movement configuration to check.
 * @returns human-readable problems with the configuration; empty when the configuration is valid.
 */
export function validateMovementConfig(config: MovementConfig): readonly string[] {
  const problems: string[] = [];
  if (config.baseSpeed <= 0) problems.push('baseSpeed must be positive');
  if (config.sprintMultiplier < 1) problems.push('sprintMultiplier must be >= 1');
  if (config.crouchMultiplier < 0 || config.crouchMultiplier > 1) problems.push('crouchMultiplier must be between 0 and 1');
  if (config.jumpImpulse <= 0) problems.push('jumpImpulse must be positive');
  if (config.gravity >= 0) problems.push('gravity must be negative');
  if (config.groundFriction < 0) problems.push('groundFriction must be non-negative');
  if (config.airControl < 0 || config.airControl > 1) problems.push('airControl must be between 0 and 1');
  if (config.maxGroundSpeed <= 0) problems.push('maxGroundSpeed must be positive');
  if (config.maxAirSpeed <= 0) problems.push('maxAirSpeed must be positive');
  return problems;
}
