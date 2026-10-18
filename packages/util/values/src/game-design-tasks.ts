/**
 * Game design to implementation task conversion.
 *
 * Converts a game design specification into implementation-ready tasks with
 * dependencies, affected files and assets, required engine APIs, acceptance
 * criteria, test cases, performance notes, and completion state, and builds
 * dependency-ordered plans through the task-planning engine. All helpers are
 * pure: they derive tasks from caller-supplied inputs, perform no I/O, and
 * hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-design-tasks
 */

import { type GameDesignSpec, estimateScope } from './game-task-spec.ts';
import {
  type CompletionState,
  type TaskPlan,
  type TaskPlanTask,
  createTaskPlan,
  transitionTaskCompletion,
} from './task-planning-engine.ts';

/** One implementation-ready task derived from a game design spec. */
export interface GameDesignTask {
  /** Stable task identifier, unique within the combined task list. */
  readonly id: string;
  /** Short title naming the task. */
  readonly title: string;
  /** What the task implements, in implementation terms. */
  readonly description: string;
  /** Identifiers of the tasks that must be implemented first. */
  readonly dependencies: readonly string[];
  /** Source paths the task creates or changes. */
  readonly affectedFiles: readonly string[];
  /** Asset paths the task creates or changes. */
  readonly affectedAssets: readonly string[];
  /** Engine APIs the task must call. */
  readonly requiredEngineApis: readonly string[];
  /** Conditions the completed task must satisfy. */
  readonly acceptanceCriteria: readonly string[];
  /** Test cases that establish the acceptance criteria. */
  readonly testCases: readonly string[];
  /** Performance considerations that constrain the implementation. */
  readonly performanceNotes: readonly string[];
  /** Completion state, using the task-planning-engine values. */
  readonly completionState: CompletionState;
}

/**
 * Derive implementation-ready tasks from a game design spec.
 *
 * Each task covers one system the design requires: input, camera, player
 * capabilities, interactions, game state, UI, progression, online networking,
 * assets, audio, accessibility, and a final performance validation over every
 * earlier task. Systems that `estimateScope` lists as deferred are omitted so
 * the task list covers the MVP: the `online multiplayer`, `advanced
 * progression systems`, and `advanced accessibility features` deferrals each
 * drop their system's task, while `3D camera polish` does not drop the camera
 * task because the base camera system is still required. Every derived task
 * starts in the `not-started` completion state.
 *
 * @param spec - game design specification to convert.
 * @returns the implementation-ready tasks in dependency order; every
 *   dependency names an earlier task in the returned list.
 */
export function deriveGameDesignTasks(spec: GameDesignSpec): readonly GameDesignTask[] {
  const scope = estimateScope(spec);
  const deferred = new Set(scope.defer);
  const tasks: GameDesignTask[] = [];
  let core = 'input-setup';

  tasks.push({
    id: 'input-setup',
    title: 'Input setup',
    description: `Map the ${spec.controls.controlScheme} control scheme and its input bindings for the ${spec.genre}.`,
    dependencies: [],
    affectedFiles: ['src/input/'],
    affectedAssets: [],
    requiredEngineApis: ['input action map', 'action state query'],
    acceptanceCriteria: [
      `Control scheme '${spec.controls.controlScheme}' maps every declared binding to a named action`,
      ...spec.controls.inputBindings.map((binding) => `Binding '${binding}' resolves to a named action`),
    ],
    testCases: [
      'Unit test: every declared binding resolves to a named action',
      'Unit test: an unbound key triggers no action',
    ],
    performanceNotes: ['Read input once per frame before game logic runs'],
    completionState: 'not-started',
  });

  tasks.push({
    id: 'camera-controls',
    title: 'Camera controls',
    description: `Configure the ${spec.controls.cameraType} camera for the ${spec.genre}.`,
    dependencies: ['input-setup'],
    affectedFiles: ['src/camera/'],
    affectedAssets: [],
    requiredEngineApis: [`${spec.controls.cameraType} camera controller`],
    acceptanceCriteria: [
      `Camera behaves as '${spec.controls.cameraType}' under the '${spec.controls.controlScheme}' control scheme`,
    ],
    testCases: [
      'Unit test: camera controller matches the configured camera type',
      'Integration test: camera input follows its bindings',
    ],
    performanceNotes: ['Update the camera after game logic to avoid visible lag'],
    completionState: 'not-started',
  });

  if (spec.capabilities.length > 0) {
    const capabilityIds = spec.capabilities.map((capability) => capability.id);
    const systems = [...new Set(spec.capabilities.flatMap((capability) => capability.dependencies))];
    tasks.push({
      id: 'capability-implementation',
      title: 'Player capabilities',
      description: `Implement the ${spec.genre} capabilities: ${capabilityIds.join(', ')}.`,
      dependencies: [core],
      affectedFiles: ['src/player/'],
      affectedAssets: [],
      requiredEngineApis: ['player controller'],
      acceptanceCriteria: [
        ...spec.capabilities.map(
          (capability) => `Capability '${capability.id}' responds to inputs: ${capability.inputs.join(', ')}`,
        ),
        ...(systems.length > 0 ? [`Required systems are available: ${systems.join(', ')}`] : []),
      ],
      testCases: spec.capabilities.map(
        (capability) => `Unit test: capability '${capability.id}' responds to ${capability.inputs.join(', ')}`,
      ),
      performanceNotes: ['Update capabilities once per game step'],
      completionState: 'not-started',
    });
    core = 'capability-implementation';
  }

  if (spec.interactions.length > 0) {
    tasks.push({
      id: 'interaction-wiring',
      title: 'Interaction wiring',
      description: `Wire each interaction trigger (${spec.interactions.map((interaction) => interaction.id).join(', ')}) to the systems it affects.`,
      dependencies: [core],
      affectedFiles: ['src/interactions/'],
      affectedAssets: [],
      requiredEngineApis: ['action event dispatch'],
      acceptanceCriteria: spec.interactions.flatMap((interaction) => [
        `Interaction '${interaction.id}' fires on trigger '${interaction.trigger}'`,
        ...(interaction.affects.length > 0
          ? [`Interaction '${interaction.id}' affects ${interaction.affects.map((id) => `'${id}'`).join(', ')}`]
          : []),
      ]),
      testCases: spec.interactions.map(
        (interaction) => `Integration test: trigger '${interaction.trigger}' runs interaction '${interaction.id}'`,
      ),
      performanceNotes: ['Dispatch interaction events within the same frame as their trigger'],
      completionState: 'not-started',
    });
    core = 'interaction-wiring';
  }

  const hasGameState =
    spec.objectives.length > 0 ||
    spec.winConditions.length > 0 ||
    spec.failureConditions.length > 0;
  if (hasGameState) {
    tasks.push({
      id: 'game-state-logic',
      title: 'Game state and conditions',
      description: `Track objectives and evaluate ${spec.winConditions.length} win and ${spec.failureConditions.length} failure conditions for the ${spec.genre}.`,
      dependencies: [core],
      affectedFiles: ['src/game-state/'],
      affectedAssets: [],
      requiredEngineApis: ['game state machine'],
      acceptanceCriteria: [
        ...spec.objectives.map(
          (objective) => `Objective '${objective.id}' completes when: ${objective.completionCondition}`,
        ),
        ...spec.winConditions.map((win) => `Win condition '${win.id}' checks: ${win.check}`),
        ...spec.failureConditions.map(
          (failure) => `Failure condition '${failure.id}' checks: ${failure.check}`,
        ),
      ],
      testCases: [
        ...spec.objectives.map(
          (objective) => `Unit test: objective '${objective.id}' completes on its condition`,
        ),
        ...spec.winConditions.map((win) => `Unit test: win condition '${win.id}' evaluates its check`),
        ...spec.failureConditions.map(
          (failure) => `Unit test: failure condition '${failure.id}' evaluates its check and recovery`,
        ),
      ],
      performanceNotes: ['Evaluate win and failure conditions once per game step'],
      completionState: 'not-started',
    });
    core = 'game-state-logic';
  }

  tasks.push({
    id: 'ui-hud',
    title: 'UI and HUD',
    description: `Build the HUD and screen flow for the ${spec.genre}.`,
    dependencies: [core],
    affectedFiles: ['src/ui/'],
    affectedAssets: ['assets/ui/'],
    requiredEngineApis: ['HUD renderer', 'screen stack'],
    acceptanceCriteria: [
      'HUD reflects the current game state',
      'Screens open and close through the screen stack',
    ],
    testCases: [
      'Unit test: HUD updates when game state changes',
      'Integration test: screen stack opens and closes screens',
    ],
    performanceNotes: ['Batch HUD updates into one pass per frame'],
    completionState: 'not-started',
  });

  if (spec.progression.length > 0 && !deferred.has('advanced progression systems')) {
    tasks.push({
      id: 'progression-implementation',
      title: 'Progression systems',
      description: `Implement progression systems: ${spec.progression.map((progression) => progression.id).join(', ')}.`,
      dependencies: [core],
      affectedFiles: ['src/progression/'],
      affectedAssets: [],
      requiredEngineApis: ['save data store'],
      acceptanceCriteria: spec.progression.map(
        (progression) =>
          `Progression '${progression.id}' unlocks per its conditions: ${progression.unlockConditions.join(', ') || 'always'}`,
      ),
      testCases: spec.progression.map(
        (progression) => `Unit test: progression '${progression.id}' unlocks at each milestone`,
      ),
      performanceNotes: ['Save progression without blocking the game loop'],
      completionState: 'not-started',
    });
  }

  if (
    (spec.online.onlineRequired || spec.online.multiplayer) &&
    !deferred.has('online multiplayer')
  ) {
    tasks.push({
      id: 'online-networking',
      title: 'Online networking',
      description: spec.online.multiplayer
        ? `Add multiplayer networking${spec.online.serverAuthoritative ? ' with server authority' : ''} for the ${spec.genre}.`
        : `Add online connectivity${spec.online.serverAuthoritative ? ' with server authority' : ''} for the ${spec.genre}.`,
      dependencies: [core],
      affectedFiles: ['src/networking/'],
      affectedAssets: [],
      requiredEngineApis: spec.online.serverAuthoritative
        ? ['network session', 'server-authoritative tick']
        : ['network session'],
      acceptanceCriteria: [
        spec.online.multiplayer
          ? 'Players share state through the network session'
          : 'Online features sync through the network session',
        ...(spec.online.serverAuthoritative
          ? ['Server-authoritative validation rejects client-only state']
          : []),
      ],
      testCases: [
        'Integration test: session connect and state sync round-trips',
        ...(spec.online.serverAuthoritative
          ? ['Unit test: server rejects unauthorized state changes']
          : []),
      ],
      performanceNotes: ['Send state updates on a fixed tick, not every rendered frame'],
      completionState: 'not-started',
    });
  }

  tasks.push({
    id: 'asset-integration',
    title: 'Art assets',
    description: `Import and configure ${spec.art.style} art assets: ${spec.art.assetGuidance}.`,
    dependencies: [],
    affectedFiles: ['src/assets/'],
    affectedAssets: ['assets/art/'],
    requiredEngineApis: ['asset loader'],
    acceptanceCriteria: [
      `Art style '${spec.art.style}' applies across loaded assets`,
      `Palette ${spec.art.palette.join(', ')} is available to assets`,
      `Lighting '${spec.art.lighting}' is configured`,
    ],
    testCases: [
      'Unit test: asset loader resolves every declared asset path',
      'Visual test: lighting matches the art direction',
    ],
    performanceNotes: ['Load assets asynchronously to keep frame times stable'],
    completionState: 'not-started',
  });

  tasks.push({
    id: 'audio-playback',
    title: 'Audio playback',
    description: spec.audio.spatialAudio
      ? `Play ${spec.audio.music} music and ${spec.audio.soundEffects} sound effects with spatial audio.`
      : `Play ${spec.audio.music} music and ${spec.audio.soundEffects} sound effects.`,
    dependencies: [],
    affectedFiles: ['src/audio/'],
    affectedAssets: ['assets/audio/'],
    requiredEngineApis: spec.audio.spatialAudio
      ? ['audio player', 'spatial audio emitter']
      : ['audio player'],
    acceptanceCriteria: [
      `Music '${spec.audio.music}' plays during gameplay`,
      `Sound effects '${spec.audio.soundEffects}' play on triggering events`,
      ...(spec.audio.spatialAudio ? ['Spatial audio positions emitters in the world'] : []),
    ],
    testCases: [
      'Unit test: music playback starts when gameplay begins',
      'Unit test: a triggering event plays its sound effect',
    ],
    performanceNotes: spec.audio.spatialAudio
      ? ['Cap concurrent spatial emitters per frame']
      : ['Stream music instead of loading every track at startup'],
    completionState: 'not-started',
  });

  const accessibility = spec.accessibility;
  const hasAccessibility =
    accessibility.colorBlind ||
    accessibility.subtitles ||
    accessibility.remappableControls ||
    accessibility.audioCues;
  if (hasAccessibility && !deferred.has('advanced accessibility features')) {
    tasks.push({
      id: 'accessibility-features',
      title: 'Accessibility features',
      description: `Add accessibility features: ${[
        ...(accessibility.colorBlind ? ['color-blind support'] : []),
        ...(accessibility.subtitles ? ['subtitles'] : []),
        ...(accessibility.remappableControls ? ['remappable controls'] : []),
        ...(accessibility.audioCues ? ['audio cues'] : []),
      ].join(', ')}.`,
      dependencies: ['input-setup', 'ui-hud'],
      affectedFiles: ['src/accessibility/'],
      affectedAssets: [],
      requiredEngineApis: [
        ...(accessibility.colorBlind ? ['color-blind palette swap'] : []),
        ...(accessibility.subtitles ? ['subtitle renderer'] : []),
        ...(accessibility.remappableControls ? ['input rebinding API'] : []),
        ...(accessibility.audioCues ? ['audio cue events'] : []),
      ],
      acceptanceCriteria: [
        ...(accessibility.colorBlind ? ['Color-blind mode distinguishes the palette colors'] : []),
        ...(accessibility.subtitles ? ['Subtitles display for spoken audio'] : []),
        ...(accessibility.remappableControls ? ['Controls can be remapped at runtime'] : []),
        ...(accessibility.audioCues ? ['Audio cues accompany key events'] : []),
      ],
      testCases: [
        ...(accessibility.colorBlind ? ['Unit test: color-blind palette swap applies'] : []),
        ...(accessibility.subtitles ? ['Unit test: subtitle text renders for spoken audio'] : []),
        ...(accessibility.remappableControls
          ? ['Unit test: rebinding a control updates the action map']
          : []),
        ...(accessibility.audioCues ? ['Unit test: audio cue fires alongside the event'] : []),
      ],
      performanceNotes: ['Apply accessibility settings without restarting the scene'],
      completionState: 'not-started',
    });
  }

  const performance = spec.performance;
  const performanceCriteria = [
    ...(performance.targetFps !== null
      ? [`Frame rate holds ${performance.targetFps} fps in representative scenes`]
      : []),
    ...(performance.targetResolution !== null
      ? [`Renders at ${performance.targetResolution}`]
      : []),
    ...(performance.minDeviceClass !== null
      ? [`Runs on ${performance.minDeviceClass} class hardware`]
      : []),
    ...(performance.memoryBudget !== null
      ? [`Memory use stays within ${performance.memoryBudget}`]
      : []),
  ];
  if (performanceCriteria.length === 0) {
    performanceCriteria.push('Frame time stays within the platform budget');
  }
  tasks.push({
    id: 'performance-validation',
    title: 'Performance validation',
    description: `Verify the ${spec.genre} build meets its performance targets.`,
    dependencies: tasks.map((task) => task.id),
    affectedFiles: ['src/performance/'],
    affectedAssets: [],
    requiredEngineApis: ['frame profiler'],
    acceptanceCriteria: performanceCriteria,
    testCases: [
      performance.targetFps !== null
        ? `Benchmark: sustained ${performance.targetFps} fps under representative load`
        : 'Benchmark: frame time under representative load',
      ...(performance.memoryBudget !== null
        ? [`Memory benchmark: peak use stays under ${performance.memoryBudget}`]
        : []),
    ],
    performanceNotes: [
      performance.targetFps !== null
        ? `Profile against the ${performance.targetFps} fps target`
        : 'Profile frame time before optimizing',
      performance.memoryBudget !== null
        ? `Track allocations against the ${performance.memoryBudget} budget`
        : 'Avoid per-frame allocations in game logic',
    ],
    completionState: 'not-started',
  });

  return tasks;
}

/**
 * Build a task plan of implementation-ready tasks from a game design spec.
 *
 * Derives the design's systems with `deriveGameDesignTasks`, appends
 * `params.additionalTasks`, validates the combined list, and maps it through
 * `createTaskPlan`. The plan objective is the MVP description from
 * `estimateScope`. Field mapping onto plan tasks: the title is prefixed to the
 * description, required engine APIs become tools, test cases become
 * verification commands, performance notes become constraints, and affected
 * files and assets become expected outputs; `requirements` and `risks` stay
 * empty because design tasks carry no counterparts. Tasks whose completion
 * state differs from `not-started` are applied with `transitionTaskCompletion`
 * rather than a local state machine.
 *
 * @param params - plan parameters: plan identifier, design spec, and optional
 *   caller tasks appended after the derived tasks.
 * @returns a dependency-ordered task plan over the combined task list.
 * @throws Error when two tasks share an identifier, when a task names an
 *   unknown dependency identifier, or when the dependencies form a cycle.
 */
export function createGameDesignTaskPlan(params: {
  /** Stable plan identifier. */
  readonly id: string;
  /** Game design specification the plan implements. */
  readonly spec: GameDesignSpec;
  /** Caller tasks appended after the derived tasks. */
  readonly additionalTasks?: readonly GameDesignTask[];
}): TaskPlan {
  const derived = deriveGameDesignTasks(params.spec);
  const tasks = [...derived, ...(params.additionalTasks ?? [])];
  validateDesignTasks(tasks);
  const plan = createTaskPlan({
    id: params.id,
    objective: estimateScope(params.spec).mvp,
    tasks: tasks.map((task) => toPlanTask(task)),
  });
  let result = plan;
  for (const task of tasks) {
    if (task.completionState !== 'not-started') {
      result = transitionTaskCompletion(result, task.id, task.completionState);
    }
  }
  return result;
}

/** Map one design task onto the plan task fields. */
function toPlanTask(task: GameDesignTask): Omit<TaskPlanTask, 'state' | 'completionState' | 'note'> {
  return {
    id: task.id,
    description: `${task.title}: ${task.description}`,
    requirements: [],
    constraints: [...task.performanceNotes],
    dependencies: task.dependencies.map((dependsOn) => ({ dependsOn, requireVerified: false })),
    tools: [...task.requiredEngineApis],
    acceptanceCriteria: [...task.acceptanceCriteria],
    verificationCommands: [...task.testCases],
    expectedOutputs: [...task.affectedFiles, ...task.affectedAssets],
    risks: [],
  };
}

/** Reject duplicate identifiers, unknown dependencies, and dependency cycles before planning. */
function validateDesignTasks(tasks: readonly GameDesignTask[]): void {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) {
      throw new Error(`duplicate task id: ${task.id}`);
    }
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dependsOn of task.dependencies) {
      if (!ids.has(dependsOn)) {
        throw new Error(`unknown dependency: ${dependsOn} (task ${task.id})`);
      }
    }
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const finished = new Set<string>();
  const visiting: string[] = [];
  const visit = (task: GameDesignTask): void => {
    if (finished.has(task.id)) return;
    if (visiting.includes(task.id)) {
      const cycle = [...visiting.slice(visiting.indexOf(task.id)), task.id];
      throw new Error(`dependency cycle detected: ${cycle.join(' -> ')}`);
    }
    visiting.push(task.id);
    for (const dependsOn of task.dependencies) {
      const next = byId.get(dependsOn);
      // Unknown identifiers were rejected by the checks above.
      if (next !== undefined) visit(next);
    }
    visiting.pop();
    finished.add(task.id);
  };
  for (const task of tasks) visit(task);
}
