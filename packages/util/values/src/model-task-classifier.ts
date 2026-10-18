/**
 * Deterministic task classifier for model routing.
 *
 * Classifies a user request into a practical category using keyword and
 * structural heuristics. The classifier is deterministic and performs no I/O;
 * model-assisted classification may wrap it, but this module never calls a
 * model. A safe fallback category is returned when no rule matches.
 *
 * @module @deepseek-ai/dsh-util-values/model-task-classifier
 */

/** Task categories used for model routing. */
export type TaskCategory =
  | 'small-code-modification'
  | 'repository-exploration'
  | 'complex-debugging'
  | 'architecture-design'
  | 'large-multi-file-implementation'
  | 'test-analysis'
  | 'documentation'
  | 'image-inspection'
  | 'game-engine-diagnostics'
  | 'security-review'
  | 'build-failure-analysis'
  | 'general';

/** A classified task with its category and supporting reasons. */
export interface TaskClassification {
  /** The selected category. */
  readonly category: TaskCategory;
  /** Short reasons that contributed to the classification. */
  readonly reasons: readonly string[];
  /** Confidence in the range 0 to 1. */
  readonly confidence: number;
}

/** Input to the classifier. */
export interface TaskClassificationInput {
  /** The user request text. */
  readonly request: string;
  /** Whether the request references image or screenshot input. */
  readonly hasImageInput?: boolean;
  /** Number of files explicitly mentioned, when known. */
  readonly mentionedFileCount?: number;
}

const RULES: readonly { readonly category: TaskCategory; readonly patterns: readonly RegExp[]; readonly reason: string }[] = [
  { category: 'image-inspection', patterns: [/\bscreenshot\b/i, /\bimage\b/i, /\bvisual\b/i, /\brender(ed)?\b/i], reason: 'image or visual terms present' },
  { category: 'security-review', patterns: [/\bsecurity\b/i, /\bvulnerabilit/i, /\bsecret\b/i, /\bauth(entication|orization)?\b/i], reason: 'security terms present' },
  { category: 'build-failure-analysis', patterns: [/\bbuild (fail|error|broke)/i, /\bcompile (error|fail)/i, /\bexport (fail|error)/i], reason: 'build or compile failure terms present' },
  { category: 'game-engine-diagnostics', patterns: [/\bunity\b/i, /\bgodot\b/i, /\bengine (error|diagnos)/i, /\bscene (broken|error)/i], reason: 'game engine terms present' },
  { category: 'complex-debugging', patterns: [/\bdebug\b/i, /\broot cause\b/i, /\bcrash\b/i, /\bstack trace\b/i], reason: 'debugging terms present' },
  { category: 'architecture-design', patterns: [/\barchitect/i, /\bdesign (system|pattern)/i, /\brefactor (architecture|structure)/i], reason: 'architecture terms present' },
  { category: 'test-analysis', patterns: [/\btest (fail|analysis|coverage)/i, /\bflaky\b/i, /\bspec\b/i], reason: 'test terms present' },
  { category: 'documentation', patterns: [/\bdocument/i, /\breadme\b/i, /\bdoc(s)?\b/i], reason: 'documentation terms present' },
  { category: 'repository-exploration', patterns: [/\bexplore\b/i, /\bfind (where|how)/i, /\bsearch (code|repo)/i, /\bunderstand (code|project)/i], reason: 'exploration terms present' },
];

/**
 * Classify a task into a category.
 * @param input - task input.
 * @returns the classification with category, reasons, and confidence.
 */
export function classifyTask(input: TaskClassificationInput): TaskClassification {
  const reasons: string[] = [];
  let best: TaskCategory = 'general';
  let bestScore = 0;

  if (input.hasImageInput === true) {
    return { category: 'image-inspection', reasons: ['image input provided'], confidence: 0.9 };
  }

  const mentioned = input.mentionedFileCount ?? 0;
  if (mentioned >= 5) {
    best = 'large-multi-file-implementation';
    bestScore = 2;
    reasons.push('many files mentioned');
  }

  for (const rule of RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(input.request)) score += 1;
    }
    if (score > bestScore) {
      best = rule.category;
      bestScore = score;
      reasons.length = 0;
      reasons.push(rule.reason);
    } else if (score > 0 && score === bestScore && best !== rule.category) {
      reasons.push(rule.reason);
    }
  }

  if (bestScore === 0) {
    if (/\bfix\b/i.test(input.request) && mentioned <= 2) {
      return { category: 'small-code-modification', reasons: ['small fix with few files'], confidence: 0.6 };
    }
    return { category: 'general', reasons: ['no specific signals'], confidence: 0.3 };
  }

  const confidence = Math.min(0.95, 0.5 + bestScore * 0.15);
  return { category: best, reasons, confidence };
}
