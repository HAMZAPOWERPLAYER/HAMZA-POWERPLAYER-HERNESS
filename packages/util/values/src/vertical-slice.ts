/**
 * Vertical slice generator model.
 *
 * Helps plan and verify a minimum playable game slice (vertical slice) that
 * demonstrates the core experience. All helpers are pure: they compute slice
 * plans and verification checklists from caller-supplied input, perform no
 * I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/vertical-slice
 */

/** One vertical slice milestone. */
export interface SliceMilestone {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description. */
  readonly description: string;
  /** Required systems. */
  readonly requiredSystems: readonly string[];
  /** Required assets. */
  readonly requiredAssets: readonly string[];
  /** Acceptance criteria. */
  readonly acceptanceCriteria: readonly string[];
  /** Whether the milestone is complete. */
  readonly complete: boolean;
}

/** Vertical slice plan. */
export interface VerticalSlicePlan {
  /** Stable identifier. */
  readonly id: string;
  /** Game genre. */
  readonly genre: string;
  /** Core experience description. */
  readonly coreExperience: string;
  /** Milestones. */
  readonly milestones: readonly SliceMilestone[];
  /** Target platforms. */
  readonly platforms: readonly string[];
  /** Estimated duration in days. */
  readonly estimatedDurationDays: number;
  /** Current progress (0 to 1). */
  readonly progress: number;
}

/**
 * Create a vertical slice plan.
 *
 * @param params - plan parameters describing the slice.
 * @returns a new plan with every milestone incomplete and zero progress.
 */
export function createVerticalSlicePlan(params: {
  readonly id: string;
  readonly genre: string;
  readonly coreExperience: string;
  readonly milestones: readonly Omit<SliceMilestone, 'complete'>[];
  readonly platforms: readonly string[];
  readonly estimatedDurationDays: number;
}): VerticalSlicePlan {
  return {
    id: params.id,
    genre: params.genre,
    coreExperience: params.coreExperience,
    milestones: params.milestones.map((m) => ({ ...m, complete: false })),
    platforms: params.platforms,
    estimatedDurationDays: params.estimatedDurationDays,
    progress: 0,
  };
}

/**
 * Complete a slice milestone, returning an updated plan with recomputed progress.
 *
 * @param plan - plan containing the milestone.
 * @param milestoneId - id of the milestone to mark complete.
 * @returns an updated plan with the milestone marked complete and progress recomputed.
 */
export function completeSliceMilestone(
  plan: VerticalSlicePlan,
  milestoneId: string,
): VerticalSlicePlan {
  const index = plan.milestones.findIndex((m) => m.id === milestoneId);
  if (index === -1) {
    throw new Error(`unknown milestone: ${milestoneId}`);
  }

  const newMilestones = plan.milestones.map((m, i) => {
    if (i === index) {
      return { ...m, complete: true };
    }
    return m;
  });

  const completedCount = newMilestones.filter((m) => m.complete).length;
  const progress = newMilestones.length === 0 ? 0 : completedCount / newMilestones.length;

  return {
    ...plan,
    milestones: newMilestones,
    progress,
  };
}

/**
 * Check whether a slice milestone can be completed.
 *
 * @param plan - plan containing the milestone.
 * @param milestoneId - id of the milestone to check.
 * @returns whether the milestone exists and is not already complete, plus a reason when it cannot be completed.
 */
export function canCompleteSliceMilestone(
  plan: VerticalSlicePlan,
  milestoneId: string,
): { readonly canComplete: boolean; readonly reason: string | null } {
  const milestone = plan.milestones.find((m) => m.id === milestoneId);
  if (milestone === undefined) {
    return { canComplete: false, reason: `unknown milestone: ${milestoneId}` };
  }

  if (milestone.complete) {
    return { canComplete: false, reason: 'milestone already complete' };
  }

  return { canComplete: true, reason: null };
}

/**
 * Get remaining milestones.
 *
 * @param plan - plan to read.
 * @returns the milestones that are not complete.
 */
export function getRemainingMilestones(
  plan: VerticalSlicePlan,
): readonly SliceMilestone[] {
  return plan.milestones.filter((m) => !m.complete);
}

/**
 * Get completed milestones.
 *
 * @param plan - plan to read.
 * @returns the milestones that are complete.
 */
export function getCompletedMilestones(
  plan: VerticalSlicePlan,
): readonly SliceMilestone[] {
  return plan.milestones.filter((m) => m.complete);
}

/** Vertical slice quality gate. */
export interface SliceQualityGate {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description. */
  readonly description: string;
  /** Whether the gate is satisfied. */
  readonly satisfied: boolean;
  /** Evidence required. */
  readonly evidenceRequired: readonly string[];
}

/**
 * Evaluate vertical slice quality gates.
 *
 * @param _plan - plan the gates apply to; unused.
 * @param gateResults - per-gate pass results with evidence.
 * @returns whether every gate passed, along with copies of the gate results.
 */
export function evaluateSliceQuality(
  _plan: VerticalSlicePlan,
  gateResults: readonly { readonly gateId: string; readonly passed: boolean; readonly evidence: readonly string[] }[],
): {
  readonly allGatesPassed: boolean;
  readonly results: readonly { readonly gateId: string; readonly passed: boolean; readonly evidence: readonly string[] }[];
} {
  const results = gateResults.map((r) => ({ ...r }));
  const allPassed = results.every((r) => r.passed);
  return { allGatesPassed: allPassed, results };
}

/** Default vertical slice milestones for common genres. */
export const DEFAULT_SLICE_MILESTONES: readonly SliceMilestone[] = [
  {
    id: 'core-mechanic',
    name: 'Core Mechanic',
    description: 'Implement and test the core gameplay mechanic.',
    requiredSystems: ['player-movement', 'input-system'],
    requiredAssets: ['player-model', 'core-environment'],
    acceptanceCriteria: ['Core mechanic is fun and responsive', 'No critical bugs'],
    complete: false,
  },
  {
    id: 'first-level',
    name: 'First Level',
    description: 'Create the first playable level with the core mechanic.',
    requiredSystems: ['level-system', 'camera-system'],
    requiredAssets: ['level-geometry', 'lighting'],
    acceptanceCriteria: ['Level is completable', 'No soft-locks'],
    complete: false,
  },
  {
    id: 'ui-hud',
    name: 'UI and HUD',
    description: 'Implement basic UI and HUD for the slice.',
    requiredSystems: ['ui-system'],
    requiredAssets: ['font', 'ui-textures'],
    acceptanceCriteria: ['HUD displays correctly', 'Menu navigation works'],
    complete: false,
  },
  {
    id: 'audio',
    name: 'Audio',
    description: 'Add core audio feedback.',
    requiredSystems: ['audio-system'],
    requiredAssets: ['sfx', 'music'],
    acceptanceCriteria: ['Key events have audio feedback', 'No audio bugs'],
    complete: false,
  },
  {
    id: 'polish',
    name: 'Polish',
    description: 'Polish the slice for demonstration.',
    requiredSystems: ['particle-system', 'animation-system'],
    requiredAssets: ['particles', 'animations'],
    acceptanceCriteria: ['Visual polish complete', 'Performance acceptable'],
    complete: false,
  },
];
