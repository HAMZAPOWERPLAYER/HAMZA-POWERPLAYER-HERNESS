/**
 * Symptom-driven game performance triage model.
 *
 * Turns a reported symptom and caller-supplied evidence into an ordered step
 * list, ranked candidate causes, and honest measured markers. The module
 * measures nothing itself: profiles and bottleneck attribution arrive from
 * analyzePerformance in ./game-performance.ts and log findings are copied by
 * the caller, so every confirming text in a result quotes supplied evidence
 * and no number is invented. All helpers are pure: they perform no I/O, read
 * no clock or random source, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-performance-triage
 */

import {
  comparePerformanceProfiles,
  type PerformanceBottleneck,
  type PerformanceProfile,
} from './game-performance.ts'

/** Symptom classes the triage workflow accepts. */
export type PerformanceSymptomKind = 'lag' | 'stutter' | 'freeze' | 'black-screen'

/** A performance symptom reported by a player or a test run. */
export interface PerformanceSymptom {
  /** Symptom class; an unrecognized runtime value fails with an unknown symptom kind error. */
  readonly kind: PerformanceSymptomKind
  /** Caller-written description of when and where the symptom appears; not parsed as evidence. */
  readonly description: string
}

/** Log finding categories that map caller-observed messages to candidate causes. */
export type PerformanceLogCategory =
  | 'scene-transition'
  | 'shader-compilation'
  | 'asset-import'
  | 'out-of-memory'
  | 'allocation-spike'
  | 'render-error'

/** One log finding copied by the caller from a reproduced run. */
export interface PerformanceLogFinding {
  /** Category that selects the causes the finding can raise. */
  readonly category: PerformanceLogCategory
  /** Log line or caller summary quoted verbatim in confirming evidence. */
  readonly detail: string
}

/** Evidence supplied to the triage workflow; nothing else is measured or inferred. */
export interface PerformanceTriageEvidence {
  /** Profile recorded for the symptomatic run; supplying it sets `measured` to true. */
  readonly profile?: PerformanceProfile
  /** Profile recorded before the fix, used for the baseline comparison. */
  readonly baselineProfile?: PerformanceProfile
  /** Bottleneck attribution produced by analyzePerformance; supplying it sets `measured` to true and is the only evidence that can confirm a cause. */
  readonly bottlenecks?: readonly PerformanceBottleneck[]
  /** Caller-observed log findings; they raise causes at most to `likely`. */
  readonly logFindings?: readonly PerformanceLogFinding[]
}

/** Identifiers of the eleven triage steps, in workflow order. */
export type TriageStepId =
  | 'reproduce'
  | 'inspect-logs'
  | 'check-update-loop'
  | 'scene-transition-loading'
  | 'shader-asset-import'
  | 'memory-allocations'
  | 'gpu-cpu-bottleneck'
  | 'identify-most-likely-cause'
  | 'targeted-fix'
  | 're-run'
  | 'compare-measurements'

/** One ordered instruction of the performance triage workflow. */
export interface PerformanceTriageStep {
  /** Stable step identifier; ids are unique within {@link PERFORMANCE_TRIAGE_STEPS}. */
  readonly id: TriageStepId
  /** What the step does. */
  readonly action: string
  /** Evidence the step must produce or read. */
  readonly evidenceRequired: string
  /** Circumstances under which the step may be skipped for a supplied evidence set. */
  readonly skipCondition: string
}

/**
 * The ordered step catalog: eleven steps from reproduction to a baseline
 * comparison, each with its action, required evidence, and skip condition.
 * {@link diagnosePerformance} returns these entries with a skip decision for
 * the supplied evidence.
 */
export const PERFORMANCE_TRIAGE_STEPS: readonly PerformanceTriageStep[] = [
  {
    id: 'reproduce',
    action: 'Reproduce the symptom on demand and record the exact steps, build, and device.',
    evidenceRequired: 'A repeatable reproduction of the symptom.',
    skipCondition: 'Never skipped; every later step depends on a repeatable symptom.',
  },
  {
    id: 'inspect-logs',
    action: 'Read error and warning logs from the reproduced run for renderer, loading, and memory messages.',
    evidenceRequired: 'Error and warning log capture from one reproduced run.',
    skipCondition: 'Skipped when log findings are already supplied.',
  },
  {
    id: 'check-update-loop',
    action: 'Inspect the main update loop for per-frame work that grows with scene size or player state.',
    evidenceRequired: 'A profiler capture of the main update loop, or a supplied CPU bottleneck attribution.',
    skipCondition: 'Skipped when a CPU bottleneck is already supplied, because that attribution already names update-loop work as the frame-time cost.',
  },
  {
    id: 'scene-transition-loading',
    action: 'Time frames across scene transitions and loading screens to check whether the symptom lines up with loading.',
    evidenceRequired: 'Frame timings captured across a scene transition or loading screen.',
    skipCondition: 'Skipped when a scene-transition log finding is already supplied.',
  },
  {
    id: 'shader-asset-import',
    action: 'Check first-use shader compilation and synchronous asset imports at the frames where the symptom appears.',
    evidenceRequired: 'First-use timings for shader compilation and asset import, or matching log findings.',
    skipCondition: 'Skipped when a shader-compilation or asset-import log finding is already supplied.',
  },
  {
    id: 'memory-allocations',
    action: 'Measure memory usage and per-frame allocations around the symptom to check for high memory use and garbage collection spikes.',
    evidenceRequired: 'Memory measurements, a memory bottleneck, or allocation log findings.',
    skipCondition: 'Skipped when a memory bottleneck, an out-of-memory finding, or an allocation-spike finding is already supplied.',
  },
  {
    id: 'gpu-cpu-bottleneck',
    action: 'Run analyzePerformance over the recorded samples and read the bottleneck it reports for CPU, GPU, draw calls, triangles, and memory.',
    evidenceRequired: 'Bottleneck attribution produced by analyzePerformance.',
    skipCondition: 'Skipped when bottleneck attribution is already supplied; an empty list records that no bottleneck was detected.',
  },
  {
    id: 'identify-most-likely-cause',
    action: 'Rank the candidate causes against the supplied evidence so the highest-ranked cause can be fixed first.',
    evidenceRequired: 'The evidence gathered by the preceding steps.',
    skipCondition: 'Never skipped; the ranking is the result this workflow produces.',
  },
  {
    id: 'targeted-fix',
    action: 'Apply one change aimed at the highest-ranked cause and record what was changed.',
    evidenceRequired: 'The highest-ranked cause from the previous step.',
    skipCondition: 'Never skipped; a change must follow the identified cause.',
  },
  {
    id: 're-run',
    action: 'Re-run the reproduction with the same recording method to collect a fresh profile after the change.',
    evidenceRequired: 'A fresh set of samples recorded after the targeted fix.',
    skipCondition: 'Never skipped; the change is not checked until it is measured again.',
  },
  {
    id: 'compare-measurements',
    action: 'Compare the baseline and current profiles with comparePerformanceProfiles to state how frame time, CPU, GPU, and memory moved.',
    evidenceRequired: 'A baseline profile and a current profile recorded the same way.',
    skipCondition: 'Skipped unless both a baseline profile and a current profile are supplied.',
  },
]

/** One catalog step with the skip decision made for a supplied evidence set. */
export interface DiagnosedTriageStep extends PerformanceTriageStep {
  /** Whether the step's skip condition holds for the supplied evidence. */
  readonly skipped: boolean
  /** Why the step was skipped; present only when `skipped` is true. */
  readonly skipReason?: string
}

/** Identifiers of the candidate causes the workflow ranks. */
export type PerformanceCauseId =
  | 'update-loop-cost'
  | 'gpu-bound-rendering'
  | 'draw-call-overhead'
  | 'geometry-overload'
  | 'memory-pressure'
  | 'scene-transition-load'
  | 'shader-compilation-hitch'
  | 'asset-import-hitch'
  | 'allocation-churn'
  | 'render-pipeline-error'

/**
 * How strongly the supplied evidence supports a cause. `confirmed` requires
 * bottleneck attribution from analyzePerformance; log findings and a profile
 * utilization comparison reach at most `likely`, and an unevidenced cause
 * stays `possible`.
 */
export type CauseLikelihood = 'confirmed' | 'likely' | 'possible'

/** One candidate cause with the evidence lists that produced its rank. */
export interface RankedCause {
  /** Candidate cause identifier. */
  readonly causeId: PerformanceCauseId
  /** Likelihood assigned from the supplied evidence. */
  readonly likelihood: CauseLikelihood
  /** Supplied evidence texts that raised the cause; empty when nothing supports it. */
  readonly confirmingEvidence: readonly string[]
  /** Labels of confirming evidence kinds that were not supplied. */
  readonly missingEvidence: readonly string[]
}

/** Percentage changes computed by comparePerformanceProfiles for two profiles. */
export type BaselineComparison = ReturnType<typeof comparePerformanceProfiles>

/** Result of one diagnosePerformance run. */
export interface PerformanceDiagnosis {
  /** Every catalog step in workflow order with its skip decision. */
  readonly steps: readonly DiagnosedTriageStep[]
  /** Candidate causes ranked from most to least likely. */
  readonly rankedCauses: readonly RankedCause[]
  /** Whether measurement evidence (a profile or bottleneck attribution) was supplied. */
  readonly measured: boolean
  /** Baseline comparison from comparePerformanceProfiles; present only when both a baseline and a current profile were supplied. */
  readonly baselineComparison?: BaselineComparison
}

/**
 * Check a performance profile's frame-time statistics and report every problem.
 *
 * Problems are reported in field order: `averageFrameTimeMs`,
 * `maxFrameTimeMs`, then `minFrameTimeMs`, each flagged when it is not a
 * finite non-negative number, so one profile can produce more than one
 * message.
 *
 * @param profile - performance profile to check.
 * @returns problem messages in report order; an empty array means the profile's frame times are usable.
 */
export function validatePerformanceProfile(profile: PerformanceProfile): readonly string[] {
  const problems: string[] = []
  if (!Number.isFinite(profile.averageFrameTimeMs) || profile.averageFrameTimeMs < 0) {
    problems.push('averageFrameTimeMs must be finite and non-negative')
  }
  if (!Number.isFinite(profile.maxFrameTimeMs) || profile.maxFrameTimeMs < 0) {
    problems.push('maxFrameTimeMs must be finite and non-negative')
  }
  if (!Number.isFinite(profile.minFrameTimeMs) || profile.minFrameTimeMs < 0) {
    problems.push('minFrameTimeMs must be finite and non-negative')
  }
  return problems
}

/**
 * Run the symptom-driven performance triage workflow.
 *
 * Returns every catalog step in order with a skip decision for the supplied
 * evidence, candidate causes ordered by the symptom's prior list and raised
 * only by supplied evidence, `measured` as the marker for whether a profile
 * or bottleneck attribution was supplied, and a baseline comparison computed
 * by comparePerformanceProfiles when both profiles are present. Without
 * measurement evidence no cause can be marked `confirmed`; log findings and
 * a profile utilization comparison reach at most `likely`.
 *
 * @param symptom - reported symptom; an unrecognized `kind` fails with an unknown symptom kind error.
 * @param profile - a measured profile on its own, or an evidence object whose `profile`, `baselineProfile`, `bottlenecks`, and `logFindings` fields carry the measurements.
 * @returns the ordered steps with skip decisions, the ranked causes with confirming and missing evidence, whether measurement evidence was supplied, and the baseline comparison when both profiles were supplied.
 * @throws Error when the symptom kind is unrecognized or a supplied profile has non-finite or negative frame times.
 */
export function diagnosePerformance(
  symptom: PerformanceSymptom,
  profile?: PerformanceProfile | PerformanceTriageEvidence,
): PerformanceDiagnosis {
  if (!isSymptomKind(symptom.kind)) {
    throw new Error(`unknown symptom kind: ${symptom.kind}`)
  }
  const evidence = normalizeEvidence(profile)
  assertUsableProfile(evidence.profile, 'performance profile')
  assertUsableProfile(evidence.baselineProfile, 'baseline performance profile')
  const steps = decideSteps(evidence)
  const rankedCauses = rankCauses(symptom.kind, evidence)
  const measured = evidence.profile !== undefined || evidence.bottlenecks !== undefined
  const baselineComparison = evidence.profile === undefined || evidence.baselineProfile === undefined
    ? undefined
    : comparePerformanceProfiles(evidence.baselineProfile, evidence.profile)
  return {
    steps,
    rankedCauses,
    measured,
    ...(baselineComparison === undefined ? {} : { baselineComparison }),
  }
}

/** Candidate causes per symptom kind, in prior order; priors order equal-likelihood causes and never raise a likelihood. */
const SYMPTOM_PRIORS: Record<PerformanceSymptomKind, readonly PerformanceCauseId[]> = {
  'lag': ['update-loop-cost', 'gpu-bound-rendering', 'draw-call-overhead', 'geometry-overload', 'memory-pressure'],
  'stutter': ['shader-compilation-hitch', 'allocation-churn', 'scene-transition-load', 'asset-import-hitch', 'draw-call-overhead'],
  'freeze': ['scene-transition-load', 'update-loop-cost', 'allocation-churn', 'asset-import-hitch', 'memory-pressure'],
  'black-screen': ['render-pipeline-error', 'shader-compilation-hitch', 'scene-transition-load', 'gpu-bound-rendering'],
}

/** Candidate cause catalog; the index doubles as the tie-break order for ranking. */
const CAUSE_IDS: readonly PerformanceCauseId[] = [
  'update-loop-cost',
  'gpu-bound-rendering',
  'draw-call-overhead',
  'geometry-overload',
  'memory-pressure',
  'scene-transition-load',
  'shader-compilation-hitch',
  'asset-import-hitch',
  'allocation-churn',
  'render-pipeline-error',
]

/** Evidence kinds that can raise one cause. */
interface CauseEvidenceRule {
  /** Bottleneck type whose attribution confirms the cause. */
  readonly bottleneck?: PerformanceBottleneck['type']
  /** Log category whose finding raises the cause to `likely`. */
  readonly logCategory?: PerformanceLogCategory
  /** Profile utilization comparison whose presence raises the cause to `likely`. */
  readonly utilizationComparison?: 'cpu' | 'gpu'
}

/** Evidence kinds per cause; every cause has at least one kind so an unevidenced cause lists missing evidence. */
const CAUSE_RULES: Record<PerformanceCauseId, CauseEvidenceRule> = {
  'update-loop-cost': { bottleneck: 'cpu', utilizationComparison: 'cpu' },
  'gpu-bound-rendering': { bottleneck: 'gpu', utilizationComparison: 'gpu' },
  'draw-call-overhead': { bottleneck: 'draw-calls' },
  'geometry-overload': { bottleneck: 'triangles' },
  'memory-pressure': { bottleneck: 'memory', logCategory: 'out-of-memory' },
  'scene-transition-load': { logCategory: 'scene-transition' },
  'shader-compilation-hitch': { logCategory: 'shader-compilation' },
  'asset-import-hitch': { logCategory: 'asset-import' },
  'allocation-churn': { logCategory: 'allocation-spike' },
  'render-pipeline-error': { logCategory: 'render-error' },
}

/** Missing-evidence labels for each bottleneck type. */
const BOTTLENECK_LABELS: Record<PerformanceBottleneck['type'], string> = {
  'cpu': 'CPU bottleneck attribution from analyzePerformance',
  'gpu': 'GPU bottleneck attribution from analyzePerformance',
  'memory': 'memory bottleneck attribution from analyzePerformance',
  'draw-calls': 'draw-call bottleneck attribution from analyzePerformance',
  'triangles': 'triangle bottleneck attribution from analyzePerformance',
}

/** Missing-evidence labels for each log finding category. */
const LOG_LABELS: Record<PerformanceLogCategory, string> = {
  'scene-transition': 'log finding showing a scene-transition stall',
  'shader-compilation': 'log finding showing shader compilation during play',
  'asset-import': 'log finding showing an asset import during play',
  'out-of-memory': 'log finding showing memory exhaustion',
  'allocation-spike': 'log finding showing an allocation spike',
  'render-error': 'log finding showing a render or shader error',
}

/** Missing-evidence labels for the profile utilization comparisons. */
const COMPARISON_LABELS: Record<'cpu' | 'gpu', string> = {
  'cpu': 'profile whose average CPU usage exceeds its average GPU usage',
  'gpu': 'profile whose average GPU usage exceeds its average CPU usage',
}

/** Sort weight per likelihood; higher ranks first. */
const LIKELIHOOD_RANK: Record<CauseLikelihood, number> = { 'confirmed': 3, 'likely': 2, 'possible': 1 }

/** Skip reasons keyed by step id; a step skips exactly when its rule returns a reason. */
const SKIP_RULES: Record<TriageStepId, (evidence: PerformanceTriageEvidence) => string | undefined> = {
  'reproduce': () => undefined,
  'inspect-logs': (evidence) =>
    evidence.logFindings === undefined ? undefined : 'log findings already supplied',
  'check-update-loop': (evidence) =>
    hasBottleneck(evidence, 'cpu') ? 'CPU bottleneck attribution already supplied' : undefined,
  'scene-transition-loading': (evidence) =>
    hasLogFinding(evidence, 'scene-transition') ? 'scene-transition log finding already supplied' : undefined,
  'shader-asset-import': (evidence) =>
    hasLogFinding(evidence, 'shader-compilation') || hasLogFinding(evidence, 'asset-import')
      ? 'shader-compilation or asset-import log finding already supplied'
      : undefined,
  'memory-allocations': (evidence) =>
    hasBottleneck(evidence, 'memory') || hasLogFinding(evidence, 'out-of-memory') || hasLogFinding(evidence, 'allocation-spike')
      ? 'memory bottleneck or allocation log finding already supplied'
      : undefined,
  'gpu-cpu-bottleneck': (evidence) =>
    evidence.bottlenecks === undefined ? undefined : 'bottleneck attribution already supplied',
  'identify-most-likely-cause': () => undefined,
  'targeted-fix': () => undefined,
  're-run': () => undefined,
  'compare-measurements': (evidence) => {
    if (evidence.profile === undefined && evidence.baselineProfile === undefined) {
      return 'no profiles supplied for comparison'
    }
    if (evidence.baselineProfile === undefined) return 'baseline profile not supplied'
    if (evidence.profile === undefined) return 'current profile not supplied'
    return undefined
  },
}

/** Sorting keys for one candidate cause. */
interface RankedEntry {
  /** Ranked cause with its evidence lists. */
  readonly cause: RankedCause
  /** Position in the symptom's prior list, or the largest rank when absent. */
  readonly priorRank: number
  /** Position in the cause catalog. */
  readonly catalogRank: number
}

/** Evidence assessment for one cause. */
interface CauseEvaluation {
  /** Likelihood reached from the supplied evidence. */
  readonly likelihood: CauseLikelihood
  /** Supplied evidence texts that raised the cause. */
  readonly confirmingEvidence: readonly string[]
  /** Labels of confirming evidence kinds that were not supplied. */
  readonly missingEvidence: readonly string[]
}

/** Whether a runtime value names a supported symptom kind. */
function isSymptomKind(value: string): value is PerformanceSymptomKind {
  return Object.keys(SYMPTOM_PRIORS).includes(value)
}

/** Resolve the optional argument to an evidence object; a bare profile is not modified. */
function normalizeEvidence(
  profile: PerformanceProfile | PerformanceTriageEvidence | undefined,
): PerformanceTriageEvidence {
  if (profile === undefined) return {}
  if ('sampleCount' in profile) return { profile }
  return profile
}

/** Fail when a supplied profile's frame-time statistics cannot be used. */
function assertUsableProfile(profile: PerformanceProfile | undefined, label: string): void {
  if (profile === undefined) return
  const problems = validatePerformanceProfile(profile)
  if (problems.length > 0) {
    throw new Error(`${label} is not valid: ${problems.join('; ')}`)
  }
}

/** Whether bottleneck attribution of the given type was supplied. */
function hasBottleneck(evidence: PerformanceTriageEvidence, type: PerformanceBottleneck['type']): boolean {
  return evidence.bottlenecks !== undefined && evidence.bottlenecks.some((bottleneck) => bottleneck.type === type)
}

/** Whether a log finding of the given category was supplied. */
function hasLogFinding(evidence: PerformanceTriageEvidence, category: PerformanceLogCategory): boolean {
  return evidence.logFindings !== undefined && evidence.logFindings.some((finding) => finding.category === category)
}

/** Assemble the catalog steps with a skip decision for the supplied evidence. */
function decideSteps(evidence: PerformanceTriageEvidence): DiagnosedTriageStep[] {
  return PERFORMANCE_TRIAGE_STEPS.map((step): DiagnosedTriageStep => {
    const skipReason = SKIP_RULES[step.id](evidence)
    if (skipReason === undefined) {
      return { ...step, skipped: false }
    }
    return { ...step, skipped: true, skipReason }
  })
}

/** Quote the profile utilization comparison that supports a cause, or nothing when it does not. */
function utilizationEvidence(
  profile: PerformanceProfile | undefined,
  comparison: 'cpu' | 'gpu',
): string | undefined {
  if (profile === undefined) return undefined
  if (comparison === 'cpu' && profile.averageCpuUsagePercent > profile.averageGpuUsagePercent) {
    return `profile: average CPU usage ${profile.averageCpuUsagePercent}% exceeds average GPU usage ${profile.averageGpuUsagePercent}%`
  }
  if (comparison === 'gpu' && profile.averageGpuUsagePercent > profile.averageCpuUsagePercent) {
    return `profile: average GPU usage ${profile.averageGpuUsagePercent}% exceeds average CPU usage ${profile.averageCpuUsagePercent}%`
  }
  return undefined
}

/** Assess one cause against the supplied evidence. */
function evaluateCause(
  causeId: PerformanceCauseId,
  evidence: PerformanceTriageEvidence,
): CauseEvaluation {
  const rule = CAUSE_RULES[causeId]
  const confirmingEvidence: string[] = []
  const missingEvidence: string[] = []
  let likelihood: CauseLikelihood = 'possible'

  const bottleneckType = rule.bottleneck
  if (bottleneckType !== undefined) {
    const bottleneck = evidence.bottlenecks === undefined
      ? undefined
      : evidence.bottlenecks.find((candidate) => candidate.type === bottleneckType)
    if (bottleneck === undefined) {
      missingEvidence.push(BOTTLENECK_LABELS[bottleneckType])
    } else {
      likelihood = 'confirmed'
      confirmingEvidence.push(`bottleneck attribution: ${bottleneck.description}`)
    }
  }

  const logCategory = rule.logCategory
  if (logCategory !== undefined) {
    const finding = evidence.logFindings === undefined
      ? undefined
      : evidence.logFindings.find((candidate) => candidate.category === logCategory)
    if (finding === undefined) {
      missingEvidence.push(LOG_LABELS[logCategory])
    } else {
      if (likelihood === 'possible') likelihood = 'likely'
      confirmingEvidence.push(`log finding (${finding.category}): ${finding.detail}`)
    }
  }

  const comparison = rule.utilizationComparison
  if (comparison !== undefined) {
    const supporting = utilizationEvidence(evidence.profile, comparison)
    if (supporting === undefined) {
      missingEvidence.push(COMPARISON_LABELS[comparison])
    } else {
      if (likelihood === 'possible') likelihood = 'likely'
      confirmingEvidence.push(supporting)
    }
  }

  return { likelihood, confirmingEvidence, missingEvidence }
}

/** Rank candidate causes for the symptom from its prior list and the supplied evidence. */
function rankCauses(
  kind: PerformanceSymptomKind,
  evidence: PerformanceTriageEvidence,
): RankedCause[] {
  const prior = SYMPTOM_PRIORS[kind]
  const entries: RankedEntry[] = []
  CAUSE_IDS.forEach((causeId, catalogRank) => {
    const priorIndex = prior.indexOf(causeId)
    const evaluation = evaluateCause(causeId, evidence)
    if (priorIndex === -1 && evaluation.likelihood === 'possible') return
    entries.push({
      cause: {
        causeId,
        likelihood: evaluation.likelihood,
        confirmingEvidence: evaluation.confirmingEvidence,
        missingEvidence: evaluation.missingEvidence,
      },
      priorRank: priorIndex === -1 ? Number.MAX_SAFE_INTEGER : priorIndex,
      catalogRank,
    })
  })
  entries.sort((left, right) => {
    const byLikelihood = LIKELIHOOD_RANK[right.cause.likelihood] - LIKELIHOOD_RANK[left.cause.likelihood]
    if (byLikelihood !== 0) return byLikelihood
    if (left.priorRank !== right.priorRank) return left.priorRank - right.priorRank
    return left.catalogRank - right.catalogRank
  })
  return entries.map((entry) => entry.cause)
}
