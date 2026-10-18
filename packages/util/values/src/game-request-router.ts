/**
 * Game development request router.
 *
 * Maps a game development request ("Create a player movement system", "Fix
 * broken interactions") to player capabilities and to the exported modules
 * that implement each capability, so callers can plan game work without
 * hand-curating a module list.
 *
 * Routing is lexical heuristics over request text: keyword rules matched
 * against the normalized request. It is not natural-language understanding.
 * The router does not read the project and does not check that a named engine
 * is available; it only echoes a caller-supplied engine as context. A request
 * that matches no rule returns no capabilities, no modules, low confidence,
 * and a clarification. Capability ids are never invented. All helpers are
 * pure: they read only their arguments, perform no I/O, read no clock, and
 * hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-request-router
 */

import type { GameEngine } from './game-project-detector.ts';
import type { GameGenre, ScopeComplexity } from './game-task-spec.ts';

/** Optional project context the router may consult. */
export interface GameRequestProject {
  /** Detected or declared engine; the router echoes it as context and never verifies it. */
  readonly engine?: GameEngine;
  /** Declared genre; accepted as context for future genre-scoped rules. */
  readonly genre?: GameGenre;
  /** Declared scope complexity; accepted as context. */
  readonly complexity?: ScopeComplexity;
}

/** One routing request: the raw request text plus optional project context. */
export interface GameRequestInput {
  /** The game development request, in any case and punctuation. */
  readonly request: string;
  /** Optional project context the router may consult. */
  readonly project?: GameRequestProject;
}

/** How firmly the router stands behind a route. */
export type GameRequestConfidence = 'high' | 'medium' | 'low';

/** The route for one request. */
export interface GameRequestRoute {
  /** Matched capability ids in rule order, without duplicates; empty when nothing matched. */
  readonly capabilities: readonly string[];
  /** Exported module basenames implementing the matched capabilities, in rule order, without duplicates. */
  readonly recommendedModules: readonly string[];
  /** Decisions whose absence changes implementation; empty when the request decided everything it needs. */
  readonly clarifications: readonly string[];
  /** `high` for a decided route, `medium` when a decision is pending, `low` for an unknown request. */
  readonly confidence: GameRequestConfidence;
}

/** One keyword rule: text patterns that name one capability and its modules. */
interface GameRequestRule {
  /** Capability id reported when any keyword matches. */
  readonly capability: string;
  /** Phrases matched against the normalized request as whole words. */
  readonly keywords: readonly string[];
  /** Exported module basenames that implement the capability, each present in `src/`. */
  readonly modules: readonly string[];
}

/**
 * Keyword rules in match order. More specific capabilities are listed before
 * general ones so their ids lead the route; a request may match several rules.
 */
const GAME_REQUEST_RULES: readonly GameRequestRule[] = [
  {
    capability: 'mobile-performance',
    keywords: ['mobile performance', 'mobile', 'improve mobile', 'android performance', 'ios performance', 'battery drain'],
    modules: ['mobile-optimization.ts'],
  },
  {
    capability: 'enemy-ai',
    keywords: ['enemy ai', 'add enemy', 'enemy behavior', 'ai behavior', 'npc ai', 'enemy intelligence', 'opponent ai'],
    modules: ['enemy-ai.ts'],
  },
  {
    capability: 'player-movement',
    keywords: ['player movement', 'movement system', 'movement', 'character movement', 'locomotion'],
    modules: ['player-movement.ts'],
  },
  {
    capability: 'interaction',
    keywords: ['broken interaction', 'broken interactions', 'interaction', 'interactions', 'puzzle'],
    modules: ['interaction-puzzle.ts'],
  },
  {
    capability: 'save-system',
    keywords: ['save system', 'save game', 'save data', 'save progress', 'load game', 'saving', 'checkpoint', 'persistence', 'persistent'],
    modules: ['game-design-tasks.ts'],
  },
  {
    capability: 'playable-prototype',
    keywords: ['playable prototype', 'prototype', 'minimum playable', 'vertical slice', 'playable game'],
    modules: ['vertical-slice.ts'],
  },
  {
    capability: 'horror-atmosphere',
    keywords: ['horror game', 'horror', 'atmosphere', 'dread', 'tension'],
    modules: ['horror-game.ts'],
  },
  {
    capability: 'game-ui',
    keywords: ['hud', 'user interface', 'game ui', 'ui', 'menu', 'interface', 'screen flow'],
    modules: ['game-ui.ts'],
  },
  {
    capability: 'game-audio',
    keywords: ['audio', 'sound', 'music', 'sfx', 'sound effect', 'sound effects'],
    modules: ['game-audio.ts'],
  },
  {
    capability: 'animation-system',
    keywords: ['animation', 'animations', 'tween'],
    modules: ['animation-system.ts'],
  },
  {
    capability: 'asset-pipeline',
    keywords: ['asset', 'assets', 'texture', 'textures', 'sprite', 'sprites', '3d model'],
    modules: ['asset-pipeline.ts'],
  },
  {
    capability: 'game-performance',
    keywords: ['performance', 'frame rate', 'fps', 'lag', 'stutter', 'optimization', 'optimize', 'slow', 'bottleneck'],
    modules: ['game-performance.ts', 'game-performance-triage.ts'],
  },
  {
    capability: 'game-testing',
    keywords: ['testing', 'test', 'tests', 'qa', 'quality assurance'],
    modules: ['game-testing.ts'],
  },
  {
    capability: 'game-quality-gate',
    keywords: ['quality gate', 'quality', 'polish', 'release', 'ship', 'launch'],
    modules: ['game-quality-gate.ts'],
  },
  {
    capability: 'integration-review',
    keywords: ['integration', 'regression', 'merge'],
    modules: ['game-integration-review.ts'],
  },
  {
    capability: 'reliability',
    keywords: ['soft lock', 'soft locks', 'soft-lock', 'softlock', 'stuck', 'progression', 'deadlock'],
    modules: ['game-reliability.ts'],
  },
];

/** Keywords that name the export-and-build capability. */
const EXPORT_BUILD_KEYWORDS: readonly string[] = [
  'export',
  'android export',
  'build error',
  'build fails',
  'build broken',
  'release build',
  'packaging',
  'apk',
  'gradle',
];

/** Lowercase, punctuation-free, single-spaced form used for keyword matching. */
function normalizeRequestText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Whether the normalized request contains the keyword as whole words. */
function hasKeyword(normalized: string, keyword: string): boolean {
  const normalizedKeyword = normalizeRequestText(keyword);
  return new RegExp(`\\b${normalizedKeyword}\\b`).test(normalized);
}

/**
 * Engine-keyed export modules, each present in `src/`. Modules accumulate
 * across every engine the request names or the caller declares; empty when
 * neither names one.
 */
function resolveExportBuildModules(
  normalized: string,
  project: GameRequestProject | undefined,
): readonly string[] {
  const engine = project?.engine;
  const modules: string[] = [];
  if (hasKeyword(normalized, 'android') || engine === 'android') modules.push('android-gradle-model.ts');
  if (hasKeyword(normalized, 'godot') || engine === 'godot') modules.push('godot-export-presets.ts', 'godot-diagnostics.ts');
  if (hasKeyword(normalized, 'unity') || engine === 'unity') modules.push('unity-diagnostics.ts');
  return modules;
}

/**
 * Route a game development request to capabilities, modules, and pending decisions.
 *
 * @param input - the request text plus optional project context.
 * @returns the matched capabilities and their implementing modules, any pending
 *   decisions, and how firmly the route follows from the request text.
 */
export function routeGameRequest(input: GameRequestInput): GameRequestRoute {
  const normalized = normalizeRequestText(input.request);
  const capabilities: string[] = [];
  const modules: string[] = [];
  const clarifications: string[] = [];

  for (const rule of GAME_REQUEST_RULES) {
    if (rule.keywords.some((keyword) => hasKeyword(normalized, keyword))) {
      capabilities.push(rule.capability);
      for (const module of rule.modules) modules.push(module);
    }
  }

  if (EXPORT_BUILD_KEYWORDS.some((keyword) => hasKeyword(normalized, keyword))) {
    capabilities.push('export-build');
    for (const module of resolveExportBuildModules(normalized, input.project)) modules.push(module);
    const engine = input.project?.engine;
    if (engine === undefined || engine === 'unknown') {
      clarifications.push('Which engine does the project use? Export presets, build diagnostics, and manifest rules differ per engine.');
    }
  }

  const uniqueCapabilities = [...new Set(capabilities)];
  const uniqueModules = [...new Set(modules)];

  let confidence: GameRequestConfidence;
  if (uniqueCapabilities.length === 0) {
    confidence = 'low';
    clarifications.push('The request matched no known game development capability. Name the system to work on, for example movement, interactions, enemy AI, UI, audio, assets, performance, testing, quality, export or build, or save and load.');
  } else if (clarifications.length > 0) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  return {
    capabilities: uniqueCapabilities,
    recommendedModules: uniqueModules,
    clarifications,
    confidence,
  };
}
