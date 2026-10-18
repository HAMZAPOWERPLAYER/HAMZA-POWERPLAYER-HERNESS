/**
 * Game architecture generator.
 *
 * Provides architecture pattern selection, system boundary definition, and
 * interface contract modeling for game projects. All helpers are pure: they
 * derive architecture decisions from caller-supplied requirements, perform no
 * I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-architecture
 */

import { GameDesignSpec } from './game-task-spec.ts';

/** Architecture pattern for a game project. */
export type ArchitecturePattern =
  | 'component-based'
  | 'state-machine'
  | 'event-driven'
  | 'data-driven'
  | 'scene-based'
  | 'modular-services'
  | 'entity-component';

/** System boundary definition. */
export interface SystemBoundary {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Responsibility description. */
  readonly responsibility: string;
  /** Systems this boundary depends on. */
  readonly dependsOn: readonly string[];
  /** Systems that depend on this boundary. */
  readonly dependedOnBy: readonly string[];
  /** Public interface contracts. */
  readonly interfaces: readonly InterfaceContract[];
}

/** Interface contract between systems. */
export interface InterfaceContract {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description of the contract. */
  readonly description: string;
  /** Provider system id. */
  readonly provider: string;
  /** Consumer system ids. */
  readonly consumers: readonly string[];
  /** Operations exposed by the contract. */
  readonly operations: readonly string[];
  /** Events emitted by the contract. */
  readonly events: readonly string[];
}

/** Recommended architecture for a game design spec. */
export interface ArchitectureRecommendation {
  /** Primary pattern. */
  readonly pattern: ArchitecturePattern;
  /** Secondary patterns. */
  readonly secondary: readonly ArchitecturePattern[];
  /** System boundaries. */
  readonly boundaries: readonly SystemBoundary[];
  /** Interface contracts. */
  readonly contracts: readonly InterfaceContract[];
  /** Rationale. */
  readonly rationale: string;
  /** Complexity warning. */
  readonly complexityWarning: string | null;
}

/**
 * Recommend an architecture pattern from a design spec.
 *
 * @param spec - game design spec paired with the project complexity.
 * @returns the recommended pattern with secondary patterns, system boundaries,
 *   interface contracts, rationale, and a complexity warning when applicable.
 */
export function recommendArchitecture(spec: {
  /** Game design spec. */
  readonly spec: GameDesignSpec;
  /** Project complexity. */
  readonly complexity: 'small' | 'medium' | 'large' | 'very-high';
}): ArchitectureRecommendation {
  const pattern = selectPattern(spec.spec, spec.complexity);
  const boundaries = deriveBoundaries(spec.spec, pattern);
  const contracts = deriveContracts(boundaries, spec.spec);
  return {
    pattern,
    secondary: secondaryPatterns(pattern),
    boundaries,
    contracts,
    rationale: rationaleFor(pattern, spec.spec),
    complexityWarning: complexityWarningFor(spec.complexity, pattern),
  };
}

/** Select the primary architecture pattern. */
function selectPattern(spec: GameDesignSpec, complexity: string): ArchitecturePattern {
  if (spec.online.onlineRequired || spec.online.multiplayer) {
    return 'entity-component';
  }
  if (complexity === 'small') {
    return 'scene-based';
  }
  if (spec.controls.cameraType === 'first-person' || spec.controls.cameraType === 'orbit') {
    return 'component-based';
  }
  if (spec.progression.length > 0 || spec.objectives.length > 3) {
    return 'state-machine';
  }
  return 'data-driven';
}

/** Derive secondary patterns from the primary pattern. */
function secondaryPatterns(pattern: ArchitecturePattern): readonly ArchitecturePattern[] {
  switch (pattern) {
    case 'component-based':
      return ['event-driven', 'data-driven'];
    case 'state-machine':
      return ['component-based', 'data-driven'];
    case 'event-driven':
      return ['component-based', 'modular-services'];
    case 'data-driven':
      return ['scene-based', 'component-based'];
    case 'scene-based':
      return ['state-machine', 'component-based'];
    case 'modular-services':
      return ['event-driven', 'component-based'];
    case 'entity-component':
      return ['component-based', 'data-driven'];
  }
}

/** Derive system boundaries from a spec and pattern. */
function deriveBoundaries(spec: GameDesignSpec, _pattern: ArchitecturePattern): readonly SystemBoundary[] {
  const boundaries: SystemBoundary[] = [];

  // Core systems present in almost every game.
  boundaries.push({
    id: 'input-system',
    name: 'Input System',
    responsibility: 'Translate raw input into game actions.',
    dependsOn: [],
    dependedOnBy: ['player-system', 'camera-system'],
    interfaces: [{ id: 'input-contract', name: 'Input Contract', description: 'Maps raw input to named actions.', provider: 'input-system', consumers: ['player-system', 'camera-system'], operations: ['getAction', 'isPressed'], events: ['actionPressed', 'actionReleased'] }],
  });

  if (spec.capabilities.length > 0) {
    boundaries.push({
      id: 'player-system',
      name: 'Player System',
      responsibility: 'Manages player state, movement, and abilities.',
      dependsOn: ['input-system'],
      dependedOnBy: ['combat-system', 'camera-system', 'ui-system'],
      interfaces: [{ id: 'player-contract', name: 'Player Contract', description: 'Exposes player state and movement commands.', provider: 'player-system', consumers: ['combat-system', 'camera-system', 'ui-system'], operations: ['move', 'interact', 'getState'], events: ['playerMoved', 'playerInteracted', 'playerDied'] }],
    });
  }

  if (spec.failureConditions.length > 0 || spec.objectives.length > 0) {
    boundaries.push({
      id: 'game-state-system',
      name: 'Game State System',
      responsibility: 'Tracks victory, failure, and progression state.',
      dependsOn: [],
      dependedOnBy: ['ui-system', 'combat-system'],
      interfaces: [{ id: 'game-state-contract', name: 'Game State Contract', description: 'Exposes current game state and win/failure conditions.', provider: 'game-state-system', consumers: ['ui-system', 'combat-system'], operations: ['getState', 'setState'], events: ['stateChanged', 'victory', 'failure'] }],
    });
  }

  const hasCombatCapability = spec.capabilities.some((c) =>
    c.description.toLowerCase().includes('combat')
  );
  const hasDefeatObjective = spec.objectives.some((o) =>
    o.description.toLowerCase().includes('defeat')
  );
  if (hasCombatCapability || hasDefeatObjective) {
    boundaries.push({
      id: 'combat-system',
      name: 'Combat System',
      responsibility: 'Handles damage, health, and combat interactions.',
      dependsOn: ['player-system', 'game-state-system'],
      dependedOnBy: ['ui-system'],
      interfaces: [{ id: 'combat-contract', name: 'Combat Contract', description: 'Exposes damage and health management.', provider: 'combat-system', consumers: ['ui-system'], operations: ['applyDamage', 'heal', 'isAlive'], events: ['damageDealt', 'entityDied'] }],
    });
  }

  boundaries.push({
    id: 'ui-system',
    name: 'UI System',
    responsibility: 'Renders menus, HUD, and feedback.',
    dependsOn: ['player-system', 'game-state-system'],
    dependedOnBy: [],
    interfaces: [{ id: 'ui-contract', name: 'UI Contract', description: 'Exposes UI state and screen transitions.', provider: 'ui-system', consumers: [], operations: ['showScreen', 'hideScreen', 'updateHud'], events: ['screenShown', 'screenHidden'] }],
  });

  return boundaries;
}

/** Derive interface contracts from boundaries and spec. */
function deriveContracts(boundaries: readonly SystemBoundary[], _spec: GameDesignSpec): readonly InterfaceContract[] {
  const contracts: InterfaceContract[] = [];
  for (const boundary of boundaries) {
    for (const iface of boundary.interfaces) {
      contracts.push(iface);
    }
  }
  return contracts;
}

/** Generate rationale for the selected pattern. */
function rationaleFor(pattern: ArchitecturePattern, _spec: GameDesignSpec): string {
  switch (pattern) {
    case 'component-based':
      return 'Component-based architecture separates concerns (input, player, combat, UI) and suits 3D or complex games with multiple interacting systems.';
    case 'state-machine':
      return 'State machine architecture is ideal for games with clear progression states (menu, playing, paused, game over) and a small number of interacting systems.';
    case 'event-driven':
      return 'Event-driven architecture decouples systems through events, suitable for online or multiplayer games with many independent actors.';
    case 'data-driven':
      return 'Data-driven architecture separates configuration from logic, suitable for games with many similar entities or content-driven design.';
    case 'scene-based':
      return 'Scene-based architecture matches small games where each scene is self-contained and transitions are explicit.';
    case 'modular-services':
      return 'Modular services architecture separates concerns into independent services, suitable for larger games with distinct subsystems.';
    case 'entity-component':
      return 'Entity-component architecture is ideal for online or multiplayer games with many entities and complex system interactions.';
  }
}

/** Generate a complexity warning for the selected pattern. */
function complexityWarningFor(complexity: string, pattern: ArchitecturePattern): string | null {
  if (complexity === 'very-high' && pattern !== 'entity-component') {
    return 'Consider entity-component architecture for very complex projects; the selected pattern may become difficult to maintain.';
  }
  if (complexity === 'small' && pattern === 'entity-component') {
    return 'Entity-component architecture may be over-engineered for a small project; consider scene-based or state-machine instead.';
  }
  return null;
}
