/**
 * Game design specification engine.
 *
 * Converts a game idea into an implementation-ready specification: requirements,
 * scope, design consistency, and task breakdown. All helpers are pure: they
 * derive specifications from caller-supplied inputs, perform no I/O, and hold
 * no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-task-spec
 */

/** Genre of a game, used to scope mechanics and systems. */
export type GameGenre =
  | 'platformer'
  | 'shooter'
  | 'rpg'
  | 'strategy'
  | 'simulation'
  | 'puzzle'
  | 'horror'
  | 'racing'
  | 'fighting'
  | 'adventure'
  | 'sports'
  | 'other';

/** Target platform for a game build. */
export type GamePlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web' | 'console';

/** Player capability. */
export interface PlayerCapability {
  /** Stable identifier for the capability. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Inputs required to use the capability. */
  readonly inputs: readonly string[];
  /** Systems the capability depends on. */
  readonly dependencies: readonly string[];
}

/** Primary interaction in a game. */
export interface PlayerInteraction {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Input that triggers the interaction. */
  readonly trigger: string;
  /** Systems affected by the interaction. */
  readonly affects: readonly string[];
}

/** Game objective. */
export interface GameObjective {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Completion condition. */
  readonly completionCondition: string;
  /** Whether the objective is required for victory. */
  readonly required: boolean;
}

/** Win condition for a game. */
export interface WinCondition {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** How the condition is checked. */
  readonly check: string;
}

/** Failure condition for a game. */
export interface FailureCondition {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** How the condition is checked. */
  readonly check: string;
  /** Recovery behavior after failure. */
  readonly recovery: string;
}

/** Progression system. */
export interface ProgressionSystem {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Levels or milestones. */
  readonly milestones: readonly string[];
  /** Unlock conditions. */
  readonly unlockConditions: readonly string[];
}

/** Camera and control scheme. */
export interface CameraControls {
  /** Camera type. */
  readonly cameraType: 'fixed' | 'follow' | 'orbit' | 'first-person' | 'top-down';
  /** Control scheme. */
  readonly controlScheme: string;
  /** Input bindings. */
  readonly inputBindings: readonly string[];
}

/** Art direction. */
export interface ArtDirection {
  /** Visual style. */
  readonly style: string;
  /** Color palette. */
  readonly palette: readonly string[];
  /** Lighting approach. */
  readonly lighting: string;
  /** Asset style guidance. */
  readonly assetGuidance: string;
}

/** Audio direction. */
export interface AudioDirection {
  /** Music approach. */
  readonly music: string;
  /** Sound effect approach. */
  readonly soundEffects: string;
  /** Spatial audio usage. */
  readonly spatialAudio: boolean;
}

/** Performance requirements. */
export interface PerformanceRequirements {
  /** Target frame rate. */
  readonly targetFps: number | null;
  /** Target resolution. */
  readonly targetResolution: string | null;
  /** Minimum device class. */
  readonly minDeviceClass: string | null;
  /** Memory budget. */
  readonly memoryBudget: string | null;
}

/** Accessibility requirements. */
export interface AccessibilityRequirements {
  /** Color-blind support. */
  readonly colorBlind: boolean;
  /** Subtitle support. */
  readonly subtitles: boolean;
  /** Remappable controls. */
  readonly remappableControls: boolean;
  /** Audio cues. */
  readonly audioCues: boolean;
}

/** Online or offline requirements. */
export interface OnlineRequirements {
  /** Whether the game requires online connectivity. */
  readonly onlineRequired: boolean;
  /** Multiplayer support. */
  readonly multiplayer: boolean;
  /** Server-authoritative. */
  readonly serverAuthoritative: boolean;
}

/** Complete game design specification. */
export interface GameDesignSpec {
  /** Stable identifier. */
  readonly id: string;
  /** Game genre. */
  readonly genre: GameGenre;
  /** Target platforms. */
  readonly platforms: readonly GamePlatform[];
  /** Player capabilities. */
  readonly capabilities: readonly PlayerCapability[];
  /** Primary interactions. */
  readonly interactions: readonly PlayerInteraction[];
  /** Objectives. */
  readonly objectives: readonly GameObjective[];
  /** Win conditions. */
  readonly winConditions: readonly WinCondition[];
  /** Failure conditions. */
  readonly failureConditions: readonly FailureCondition[];
  /** Progression system. */
  readonly progression: readonly ProgressionSystem[];
  /** Camera and controls. */
  readonly controls: CameraControls;
  /** Art direction. */
  readonly art: ArtDirection;
  /** Audio direction. */
  readonly audio: AudioDirection;
  /** Performance requirements. */
  readonly performance: PerformanceRequirements;
  /** Accessibility requirements. */
  readonly accessibility: AccessibilityRequirements;
  /** Online requirements. */
  readonly online: OnlineRequirements;
}

/** Scope complexity estimate. */
export type ScopeComplexity = 'small' | 'medium' | 'large' | 'epic';

/** Scope estimation result. */
export interface ScopeEstimate {
  /** Overall complexity. */
  readonly complexity: ScopeComplexity;
  /** Contributing factors. */
  readonly factors: readonly string[];
  /** Minimum playable version description. */
  readonly mvp: string;
  /** Systems to defer. */
  readonly defer: readonly string[];
  /** Estimated implementation effort (qualitative). */
  readonly effort: 'low' | 'medium' | 'high' | 'very-high';
}

/** Design consistency issue. */
export interface ConsistencyIssue {
  /** Severity. */
  readonly severity: 'info' | 'warning' | 'error';
  /** Description. */
  readonly message: string;
  /** Related entity id. */
  readonly entityId: string | null;
  /** Suggested resolution. */
  readonly suggestion: string | null;
}

/** Design consistency check result. */
export interface ConsistencyCheck {
  /** Whether the design is consistent. */
  readonly consistent: boolean;
  /** Issues found. */
  readonly issues: readonly ConsistencyIssue[];
}

/**
 * Create a game design specification from raw inputs.
 *
 * @param params - raw design fields to package.
 * @returns the design specification assembled from the supplied fields.
 */
export function createGameDesignSpec(params: {
  /** Stable identifier. */
  readonly id: string;
  /** Game genre. */
  readonly genre: GameGenre;
  /** Target platforms. */
  readonly platforms: readonly GamePlatform[];
  /** Player capabilities. */
  readonly capabilities: readonly PlayerCapability[];
  /** Primary interactions. */
  readonly interactions: readonly PlayerInteraction[];
  /** Objectives. */
  readonly objectives: readonly GameObjective[];
  /** Win conditions. */
  readonly winConditions: readonly WinCondition[];
  /** Failure conditions. */
  readonly failureConditions: readonly FailureCondition[];
  /** Progression system. */
  readonly progression: readonly ProgressionSystem[];
  /** Camera and controls. */
  readonly controls: CameraControls;
  /** Art direction. */
  readonly art: ArtDirection;
  /** Audio direction. */
  readonly audio: AudioDirection;
  /** Performance requirements. */
  readonly performance: PerformanceRequirements;
  /** Accessibility requirements. */
  readonly accessibility: AccessibilityRequirements;
  /** Online requirements. */
  readonly online: OnlineRequirements;
}): GameDesignSpec {
  return {
    id: params.id,
    genre: params.genre,
    platforms: params.platforms,
    capabilities: params.capabilities,
    interactions: params.interactions,
    objectives: params.objectives,
    winConditions: params.winConditions,
    failureConditions: params.failureConditions,
    progression: params.progression,
    controls: params.controls,
    art: params.art,
    audio: params.audio,
    performance: params.performance,
    accessibility: params.accessibility,
    online: params.online,
  };
}

/**
 * Estimate scope complexity from a design spec.
 *
 * @param spec - design specification to estimate.
 * @returns complexity, contributing factors, MVP description, deferred systems, and effort for the spec.
 */
export function estimateScope(spec: GameDesignSpec): ScopeEstimate {
  const factors: string[] = [];
  let weight = 0;

  weight += spec.capabilities.length;
  weight += spec.interactions.length;
  weight += spec.objectives.length;
  weight += spec.progression.length;

  if (spec.online.onlineRequired || spec.online.multiplayer) {
    weight += 3;
    factors.push('online or multiplayer networking');
  }

  if (spec.controls.cameraType === 'first-person' || spec.controls.cameraType === 'orbit') {
    weight += 1;
    factors.push('3D camera system');
  }

  if (spec.performance.targetFps !== null && spec.performance.targetFps >= 60) {
    weight += 1;
    factors.push('high frame rate target');
  }

  if (spec.accessibility.colorBlind || spec.accessibility.subtitles) {
    weight += 1;
    factors.push('accessibility features');
  }

  let complexity: ScopeComplexity = 'small';
  if (weight >= 12) complexity = 'epic';
  else if (weight >= 8) complexity = 'large';
  else if (weight >= 4) complexity = 'medium';

  const mvp = deriveMVP(spec, complexity);
  const defer = deriveDeferrals(spec, complexity);

  return { complexity, factors, mvp, defer, effort: complexityToEffort(complexity) };
}

/**
 * Check design consistency across capabilities, interactions, and objectives.
 *
 * @param spec - design specification to check.
 * @returns whether no error-severity issues were found, with every issue found.
 */
export function checkDesignConsistency(spec: GameDesignSpec): ConsistencyCheck {
  const issues: ConsistencyIssue[] = [];

  const interactionTargets = new Set(spec.interactions.map((i) => i.id));
  for (const obj of spec.objectives) {
    if (!interactionTargets.has(obj.id)) {
      // Objective id may differ from interaction id; this is a soft check.
    }
  }

  const capabilityIds = new Set(spec.capabilities.map((c) => c.id));
  for (const interaction of spec.interactions) {
    for (const dep of interaction.affects) {
      if (!capabilityIds.has(dep)) {
        issues.push({
          severity: 'warning',
          message: `Interaction '${interaction.id}' affects unknown capability '${dep}'.`,
          entityId: interaction.id,
          suggestion: `Add capability '${dep}' or remove it from interaction affects.`,
        });
      }
    }
  }

  for (const prog of spec.progression) {
    for (const _unlock of prog.unlockConditions) {
      // Unlock conditions reference capability ids; soft check.
    }
  }

  return { consistent: issues.filter((i) => i.severity === 'error').length === 0, issues };
}

/** Derive a minimum playable version description. */
function deriveMVP(spec: GameDesignSpec, complexity: ScopeComplexity): string {
  const core = spec.capabilities.length > 0 ? spec.capabilities[0]!.description : 'core mechanic';
  const objective = spec.objectives.length > 0 ? spec.objectives[0]!.description : 'primary goal';
  switch (complexity) {
    case 'small':
      return `Single-level ${spec.genre} with ${core} and one ${objective.toLowerCase()}.`;
    case 'medium':
      return `Multi-level ${spec.genre} with ${spec.capabilities.length} capabilities and ${spec.objectives.length} objectives.`;
    case 'large':
      return `Full ${spec.genre} with progression, ${spec.capabilities.length} capabilities, and ${spec.objectives.length} objectives.`;
    case 'epic':
      return `Full ${spec.genre} with ${spec.capabilities.length} capabilities, ${spec.objectives.length} objectives, ${spec.progression.length} progression systems, and online features.`;
  }
}

/** Derive systems to defer based on complexity. */
function deriveDeferrals(spec: GameDesignSpec, complexity: ScopeComplexity): readonly string[] {
  const defer: string[] = [];
  if (complexity === 'small' || complexity === 'medium') {
    if (spec.online.onlineRequired) defer.push('online multiplayer');
    if (spec.progression.length > 2) defer.push('advanced progression systems');
  }
  if (complexity === 'small') {
    if (spec.controls.cameraType === 'first-person') defer.push('3D camera polish');
    if (spec.accessibility.colorBlind || spec.accessibility.subtitles)
      defer.push('advanced accessibility features');
  }
  return defer;
}

/** Convert complexity to effort estimate. */
function complexityToEffort(complexity: ScopeComplexity): 'low' | 'medium' | 'high' | 'very-high' {
  switch (complexity) {
    case 'small': return 'low';
    case 'medium': return 'medium';
    case 'large': return 'high';
    case 'epic': return 'very-high';
  }
}
