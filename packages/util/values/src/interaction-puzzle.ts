/**
 * Interaction, puzzle, and progression systems model.
 *
 * Represents interaction targets, puzzle states, and progression tracking for
 * game development. All helpers are pure: they compute state transitions from
 * caller-supplied input, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/interaction-puzzle
 */

/** One interaction target in the game world. */
export interface InteractionTarget {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Interaction prompt text shown to the player. */
  readonly prompt: string;
  /** Interaction range (units). */
  readonly range: number;
  /** Whether the interaction is currently available. */
  readonly available: boolean;
  /** Whether the interaction has been completed. */
  readonly completed: boolean;
  /** Required item id, if any. */
  readonly requiredItem: string | null;
  /** Systems affected by the interaction. */
  readonly affects: readonly string[];
}

/** Interaction result. */
export interface InteractionResult {
  /** Whether the interaction succeeded. */
  readonly succeeded: boolean;
  /** Human-readable feedback message. */
  readonly message: string;
  /** Whether the target is now completed. */
  readonly completed: boolean;
  /** New target position, if the interaction moves something. */
  readonly newTargetPosition: readonly [number, number, number] | null;
  /** Items granted by the interaction. */
  readonly itemsGranted: readonly string[];
}

/**
 * Attempt an interaction with a target.
 *
 * @param target - interaction target to attempt.
 * @param playerInventory - ids of items the player carries.
 * @param distance - current distance to the target (units).
 * @returns the outcome: success, feedback message, completion state, new target position, and items granted.
 */
export function attemptInteraction(
  target: InteractionTarget,
  playerInventory: readonly string[],
  distance: number,
): InteractionResult {
  if (!target.available) {
    return {
      succeeded: false,
      message: `${target.name} is not available.`,
      completed: target.completed,
      newTargetPosition: null,
      itemsGranted: [],
    };
  }

  if (distance > target.range) {
    return {
      succeeded: false,
      message: `${target.name} is too far away.`,
      completed: target.completed,
      newTargetPosition: null,
      itemsGranted: [],
    };
  }

  if (target.requiredItem !== null && !playerInventory.includes(target.requiredItem)) {
    return {
      succeeded: false,
      message: `${target.name} requires ${target.requiredItem}.`,
      completed: target.completed,
      newTargetPosition: null,
      itemsGranted: [],
    };
  }

  if (target.completed) {
    return {
      succeeded: true,
      message: `${target.name} has already been interacted with.`,
      completed: true,
      newTargetPosition: null,
      itemsGranted: [],
    };
  }

  return {
    succeeded: true,
    message: `Interacted with ${target.name}.`,
    completed: true,
    newTargetPosition: null,
    itemsGranted: [],
  };
}

/** One puzzle state. */
export interface PuzzleState {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Current progress (0 to 1). */
  readonly progress: number;
  /** Whether the puzzle is solved. */
  readonly solved: boolean;
  /** Required item ids. */
  readonly requiredItems: readonly string[];
  /** Current item states. */
  readonly itemStates: readonly { readonly itemId: string; readonly state: string }[];
  /** Hint text. */
  readonly hint: string | null;
}

/** Puzzle interaction result. */
export interface PuzzleInteractionResult {
  /** Whether the puzzle is now solved. */
  readonly solved: boolean;
  /** New progress (0 to 1). */
  readonly progress: number;
  /** Human-readable feedback. */
  readonly message: string;
  /** Items granted. */
  readonly itemsGranted: readonly string[];
}

/**
 * Attempt a puzzle interaction.
 *
 * @param puzzle - puzzle state to interact with.
 * @param playerInventory - ids of items the player carries.
 * @param action - action name, such as `inspect`, `manipulate`, or `use`.
 * @param value - action value such as an item id, or null when unused.
 * @returns the resulting solved state, progress, feedback message, and items granted.
 */
export function interactWithPuzzle(
  puzzle: PuzzleState,
  playerInventory: readonly string[],
  action: string,
  value: string | null,
): PuzzleInteractionResult {
  if (puzzle.solved) {
    return {
      solved: true,
      progress: puzzle.progress,
      message: `${puzzle.name} is already solved.`,
      itemsGranted: [],
    };
  }

  // Check required items
  for (const required of puzzle.requiredItems) {
    if (!playerInventory.includes(required)) {
      return {
        solved: false,
        progress: puzzle.progress,
        message: `${puzzle.name} requires ${required}.`,
        itemsGranted: [],
      };
    }
  }

  // Simple action-based progression
  let newProgress = puzzle.progress;
  let solved = false;
  let message = '';

  if (action === 'inspect') {
    newProgress = Math.min(puzzle.progress + 0.25, 1);
    message = `Inspected ${puzzle.name}.`;
  } else if (action === 'manipulate' && value !== null) {
    newProgress = Math.min(puzzle.progress + 0.5, 1);
    message = `Manipulated ${puzzle.name} with ${value}.`;
  } else if (action === 'use' && value !== null && playerInventory.includes(value)) {
    newProgress = Math.min(puzzle.progress + 0.5, 1);
    message = `Used ${value} on ${puzzle.name}.`;
  } else {
    message = `Nothing happened with ${puzzle.name}.`;
  }

  if (newProgress >= 1) {
    solved = true;
    message = `Solved ${puzzle.name}!`;
  }

  return {
    solved,
    progress: newProgress,
    message,
    itemsGranted: [],
  };
}

/** One progression milestone. */
export interface ProgressionMilestone {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description. */
  readonly description: string;
  /** Required objective ids. */
  readonly requiredObjectives: readonly string[];
  /** Unlocked capabilities. */
  readonly unlockedCapabilities: readonly string[];
  /** Whether the milestone is complete. */
  readonly complete: boolean;
}

/** Progression state. */
export interface ProgressionState {
  /** Milestones. */
  readonly milestones: readonly ProgressionMilestone[];
  /** Completed objective ids. */
  readonly completedObjectives: readonly string[];
  /** Current chapter or level. */
  readonly currentLevel: string | null;
  /** Total play time (seconds). */
  readonly playTime: number;
}

/**
 * Reason a milestone cannot be completed, shared by the advisory check and the
 * enforcing completion so both report identical text.
 *
 * @param state - progression state containing the milestone.
 * @param milestoneId - id of the milestone to check.
 * @returns null when the milestone exists, is incomplete, and every required objective is
 *   completed; otherwise the rejection reason.
 */
function milestoneBlockReason(
  state: ProgressionState,
  milestoneId: string,
): string | null {
  const milestone = state.milestones.find((m) => m.id === milestoneId);
  if (milestone === undefined) {
    return `unknown milestone: ${milestoneId}`;
  }

  if (milestone.complete) {
    return 'milestone already complete';
  }

  const missing = milestone.requiredObjectives.filter(
    (obj) => !state.completedObjectives.includes(obj),
  );
  if (missing.length > 0) {
    return `missing objectives: ${missing.join(', ')}`;
  }

  return null;
}

/**
 * Complete a milestone.
 *
 * Enforces {@link canCompleteMilestone}: the milestone must exist, must not already
 * be complete, and every one of its required objectives must be recorded in
 * `state.completedObjectives`. A rejected call throws the reason
 * `canCompleteMilestone` reports for the same input and returns no state, so a
 * player cannot skip required objectives or complete the same milestone twice.
 *
 * @param state - progression state containing the milestone.
 * @param milestoneId - id of the milestone to mark complete.
 * @returns updated progression state with the milestone complete and its id among the completed objectives.
 * @throws Error with `unknown milestone: <milestoneId>` when no milestone has that id,
 *   `milestone already complete` when the milestone is already complete, or
 *   `missing objectives: <ids>` when required objectives are not completed.
 */
export function completeMilestone(
  state: ProgressionState,
  milestoneId: string,
): ProgressionState {
  const blocked = milestoneBlockReason(state, milestoneId);
  if (blocked !== null) {
    throw new Error(blocked);
  }

  const index = state.milestones.findIndex((m) => m.id === milestoneId);
  const newMilestones = state.milestones.map((m, i) => {
    if (i === index) {
      return { ...m, complete: true };
    }
    return m;
  });

  const newCompletedObjectives = [...state.completedObjectives];
  if (!newCompletedObjectives.includes(milestoneId)) {
    newCompletedObjectives.push(milestoneId);
  }

  return {
    milestones: newMilestones,
    completedObjectives: newCompletedObjectives,
    currentLevel: state.currentLevel,
    playTime: state.playTime,
  };
}

/**
 * Check if a milestone can be completed.
 *
 * Reports the exact acceptance `completeMilestone` enforces: for any state,
 * `canCompleteMilestone(state, id)` returns `canComplete: false` with `reason`
 * precisely when `completeMilestone(state, id)` throws an `Error` with that
 * `reason` text.
 *
 * @param state - progression state containing the milestone.
 * @param milestoneId - id of the milestone to check.
 * @returns whether the milestone exists, is incomplete, and has all required objectives, plus a reason when it cannot be completed.
 */
export function canCompleteMilestone(
  state: ProgressionState,
  milestoneId: string,
): { readonly canComplete: boolean; readonly reason: string | null } {
  const reason = milestoneBlockReason(state, milestoneId);
  if (reason !== null) {
    return { canComplete: false, reason };
  }
  return { canComplete: true, reason: null };
}
