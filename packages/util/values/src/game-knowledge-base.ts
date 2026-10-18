/**
 * Game development knowledge base model.
 *
 * Provides a project-specific knowledge structure for architecture decisions,
 * engine notes, resolved bugs, and configuration. All helpers are pure: they
 * query and derive knowledge from caller-supplied data, perform no I/O, and
 * hold no state. Entry validation reports a detected credential by kind with
 * the value redacted, and {@link resolveSourcePrecedence} keeps observed
 * source evidence authoritative over recorded notes.
 *
 * @module @deepseek-ai/dsh-util-values/game-knowledge-base
 */

import { REDACTED_PLACEHOLDER, redactSecretAssignment, redactSecrets } from './secret-redaction.ts'

/** One knowledge base entry. */
export interface KnowledgeBaseEntry {
  /** Stable identifier. */
  readonly id: string;
  /** Entry type. */
  readonly type: 'architecture' | 'engine-note' | 'resolved-bug' | 'convention' | 'performance-note' | 'security-note';
  /** Title. */
  readonly title: string;
  /** Content. */
  readonly content: string;
  /** Tags. */
  readonly tags: readonly string[];
  /** Related file paths. */
  readonly relatedFiles: readonly string[];
  /** Version when created. */
  readonly version: string | null;
  /** Source version the entry was derived from; absent when the entry records no source observation. */
  readonly sourceVersion?: string;
  /** Creation timestamp. */
  readonly createdAt: number;
  /** Last updated timestamp. */
  readonly updatedAt: number;
  /** Confidence level (0 to 1). */
  readonly confidence: number;
}

/**
 * Create a knowledge base entry.
 *
 * @param params - entry fields to copy into the entry; `sourceVersion` is
 *   omitted from the entry when not provided.
 * @returns the knowledge base entry built from the given fields.
 */
export function createKnowledgeBaseEntry(params: {
  readonly id: string;
  readonly type: 'architecture' | 'engine-note' | 'resolved-bug' | 'convention' | 'performance-note' | 'security-note';
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly relatedFiles: readonly string[];
  readonly version: string | null;
  readonly sourceVersion?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly confidence: number;
}): KnowledgeBaseEntry {
  const entry: KnowledgeBaseEntry = {
    id: params.id,
    type: params.type,
    title: params.title,
    content: params.content,
    tags: params.tags,
    relatedFiles: params.relatedFiles,
    version: params.version,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
    confidence: params.confidence,
  };
  return params.sourceVersion === undefined ? entry : { ...entry, sourceVersion: params.sourceVersion };
}

/** Knowledge base state. */
export interface KnowledgeBase {
  /** Entries. */
  readonly entries: readonly KnowledgeBaseEntry[];
  /** Version. */
  readonly version: string;
}

/**
 * Create an empty knowledge base.
 *
 * @param params - knowledge base fields: the initial entries and the version.
 * @returns the knowledge base holding the given entries and version.
 */
export function createKnowledgeBase(params: {
  readonly entries: readonly KnowledgeBaseEntry[];
  readonly version: string;
}): KnowledgeBase {
  return {
    entries: params.entries,
    version: params.version,
  };
}

/**
 * Add an entry to the knowledge base.
 *
 * @param kb - knowledge base to extend.
 * @param entry - entry to append.
 * @returns a new knowledge base with the entry appended and the version unchanged.
 */
export function addEntry(
  kb: KnowledgeBase,
  entry: KnowledgeBaseEntry,
): KnowledgeBase {
  return {
    entries: [...kb.entries, entry],
    version: kb.version,
  };
}

/**
 * Update an entry.
 *
 * @param kb - knowledge base holding the entry.
 * @param id - identifier of the entry to update.
 * @param updates - fields to overwrite on the matched entry.
 * @returns a new knowledge base whose matching entry carries the updated
 * fields and a fresh update timestamp; throws when no entry has the given id.
 */
export function updateEntry(
  kb: KnowledgeBase,
  id: string,
  updates: {
    readonly title?: string;
    readonly content?: string;
    readonly tags?: readonly string[];
    readonly relatedFiles?: readonly string[];
    readonly version?: string | null;
    readonly confidence?: number;
  },
): KnowledgeBase {
  const index = kb.entries.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`unknown knowledge base entry: ${id}`);
  }

  const entry = kb.entries[index]!;
  const baseEntry: KnowledgeBaseEntry = {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    content: entry.content,
    tags: entry.tags,
    relatedFiles: entry.relatedFiles,
    version: entry.version,
    createdAt: entry.createdAt,
    updatedAt: Date.now(),
    confidence: entry.confidence,
    ...updates,
  };
  const newEntry: KnowledgeBaseEntry =
    entry.sourceVersion === undefined ? baseEntry : { ...baseEntry, sourceVersion: entry.sourceVersion };

  const newEntries = kb.entries.map((e, i) => (i === index ? newEntry : e));

  return {
    entries: newEntries,
    version: kb.version,
  };
}

/**
 * Remove an entry.
 *
 * @param kb - knowledge base to remove from.
 * @param id - identifier of the entries to drop.
 * @returns a new knowledge base without entries carrying the given id.
 */
export function removeEntry(
  kb: KnowledgeBase,
  id: string,
): KnowledgeBase {
  const newEntries = kb.entries.filter((e) => e.id !== id);
  return {
    entries: newEntries,
    version: kb.version,
  };
}

/**
 * Search knowledge base entries.
 *
 * @param kb - knowledge base to search.
 * @param query - case-insensitive text matched against titles, content, and tags.
 * @returns the entries whose title, content, or tags contain the query.
 */
export function searchKnowledgeBase(
  kb: KnowledgeBase,
  query: string,
): readonly KnowledgeBaseEntry[] {
  const lowered = query.toLowerCase();
  return kb.entries.filter(
    (e) =>
      e.title.toLowerCase().includes(lowered) ||
      e.content.toLowerCase().includes(lowered) ||
      e.tags.some((t) => t.toLowerCase().includes(lowered)),
  );
}

/**
 * Get entries by type.
 *
 * @param kb - knowledge base to query.
 * @param type - entry type to match.
 * @returns the entries whose type matches.
 */
export function getEntriesByType(
  kb: KnowledgeBase,
  type: KnowledgeBaseEntry['type'],
): readonly KnowledgeBaseEntry[] {
  return kb.entries.filter((e) => e.type === type);
}

/**
 * Get entries by tag.
 *
 * @param kb - knowledge base to query.
 * @param tag - exact tag to match.
 * @returns the entries carrying the given tag.
 */
export function getEntriesByTag(
  kb: KnowledgeBase,
  tag: string,
): readonly KnowledgeBaseEntry[] {
  return kb.entries.filter((e) => e.tags.includes(tag));
}

/**
 * Get entries related to a file.
 *
 * @param kb - knowledge base to query.
 * @param filePath - exact related file path to match.
 * @returns the entries listing the given file path.
 */
export function getEntriesByFile(
  kb: KnowledgeBase,
  filePath: string,
): readonly KnowledgeBaseEntry[] {
  return kb.entries.filter((e) => e.relatedFiles.includes(filePath));
}

/**
 * Ranking of a knowledge base entry against observed source evidence.
 *
 * `rely` - the entry's recorded source version matches the observed source.
 * `superseded-by-source` - the source has moved past the entry, so the source wins.
 * `unverified` - no comparison was possible, so the entry stays an unconfirmed note.
 */
export type SourcePrecedence = 'rely' | 'superseded-by-source' | 'unverified';

/**
 * Rank an entry against the source version observed in the code.
 *
 * An entry never overrides the source: a recorded source version that differs
 * from the observed version ranks `superseded-by-source`, and the comparison
 * returns `unverified` rather than `rely` when either side records no version.
 *
 * @param entry - entry to rank.
 * @param observedCurrentVersion - source version currently observed in the
 *   code, or null when no source version was observed.
 * @returns `rely` when the entry's recorded source version matches the
 *   observed source version, `superseded-by-source` when the source moved past
 *   the recorded version, and `unverified` when either side records no version.
 */
export function resolveSourcePrecedence(
  entry: KnowledgeBaseEntry,
  observedCurrentVersion: string | null,
): SourcePrecedence {
  if (entry.sourceVersion === undefined || observedCurrentVersion === null) {
    return 'unverified';
  }
  return entry.sourceVersion === observedCurrentVersion ? 'rely' : 'superseded-by-source';
}

/** Summarize knowledge base. */
export interface KnowledgeBaseSummary {
  /** Total entries. */
  readonly totalEntries: number;
  /** Entries by type. */
  readonly entriesByType: readonly { readonly type: string; readonly count: number }[];
  /** Average confidence. */
  readonly averageConfidence: number;
  /** Entries with low confidence. */
  readonly lowConfidenceEntries: readonly string[];
}

/**
 * Summarize knowledge base.
 *
 * @param kb - knowledge base to summarize.
 * @returns total entries, per-type counts, the average confidence, and the
 * identifiers of entries whose confidence is below 0.5.
 */
export function summarizeKnowledgeBase(kb: KnowledgeBase): KnowledgeBaseSummary {
  const totalEntries = kb.entries.length;
  const entriesByType: { readonly type: string; readonly count: number }[] = [];

  const typeCounts = new Map<string, number>();
  for (const e of kb.entries) {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
  }

  for (const [type, count] of typeCounts) {
    entriesByType.push({ type, count });
  }

  const averageConfidence =
    totalEntries === 0
      ? 0
      : kb.entries.reduce((sum, e) => sum + e.confidence, 0) / totalEntries;

  const lowConfidenceEntries = kb.entries
    .filter((e) => e.confidence < 0.5)
    .map((e) => e.id);

  return {
    totalEntries,
    entriesByType,
    averageConfidence,
    lowConfidenceEntries,
  };
}

/**
 * Key-name tokens naming the credential kind of an assignment line, mirroring
 * the key tokens of {@link redactSecretAssignment}.
 */
const CREDENTIAL_KIND_TOKENS: readonly { readonly token: RegExp; readonly kind: string }[] = [
  { token: /PASSWORD|PASSWD/u, kind: 'password' },
  { token: /TOKEN/u, kind: 'token' },
  { token: /API_KEY/u, kind: 'api-key' },
  { token: /PRIVATE_KEY/u, kind: 'private-key' },
  { token: /SECRET|CREDENTIAL/u, kind: 'secret' },
];

/** PEM private key block opener; the secret-redaction helpers cover no PEM-block shape. */
const PRIVATE_KEY_BLOCK_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u;

/**
 * Name the credential kind of an assignment line. Detection reuses
 * {@link redactSecretAssignment}; only the key name, which is not the secret,
 * is read to name the kind.
 *
 * @param line - single assignment-shaped line to classify.
 * @returns the credential kind named by the key, or null when the line carries none.
 */
function assignmentCredentialKind(line: string): string | null {
  if (redactSecretAssignment(line) === line) return null;
  const keyMatch = /^(\s*[A-Za-z_][A-Za-z0-9_]*)/u.exec(line);
  const keyText = (keyMatch?.[1] ?? '').toUpperCase();
  for (const { token, kind } of CREDENTIAL_KIND_TOKENS) {
    if (token.test(keyText)) return kind;
  }
  return 'secret';
}

/**
 * Name the credential kinds present in entry text.
 *
 * Secret-shaped tokens are detected by {@link redactSecrets}; small hints then
 * name the kind. A PEM block opener names private keys, a shape the maintained
 * redaction helpers do not cover, and assignment lines are classified through
 * {@link redactSecretAssignment}.
 *
 * @param text - title, content, or joined tag text to screen.
 * @returns the credential kinds found, in detection order without repeats.
 */
function detectCredentialKinds(text: string): readonly string[] {
  const kinds: string[] = [];
  const add = (kind: string): void => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };
  if (PRIVATE_KEY_BLOCK_PATTERN.test(text)) add('private-key');
  for (const line of text.split(/\r?\n/u)) {
    const kind = assignmentCredentialKind(line);
    if (kind !== null) add(kind);
  }
  if (redactSecrets(text) !== text) {
    const isToken = /\bbearer\s/iu.test(text) || /\beyJ[A-Za-z0-9_-]{10,}\./u.test(text);
    add(isToken ? 'token' : 'api-key');
  }
  return kinds;
}

/**
 * Report the detected credentials of one entry field. Each message names the
 * field and the credential kind and carries only {@link REDACTED_PLACEHOLDER}
 * in place of the value, so the secret itself never reaches a report.
 *
 * @param field - entry field name the text came from.
 * @param text - field text to screen.
 * @returns one message per detected credential kind, empty when none matched.
 */
function credentialProblems(field: string, text: string): readonly string[] {
  return detectCredentialKinds(text).map(
    (kind) => `${field}: credential of kind "${kind}" detected; value redacted to ${REDACTED_PLACEHOLDER}`,
  );
}

/**
 * Validate knowledge base entry.
 *
 * Beyond the structural rules, the title, content, and tags are screened for
 * credentials; a detection reports one problem per credential kind that names
 * the kind and never the secret value.
 *
 * @param entry - entry to check.
 * @returns a problem message for each violated rule, empty when the entry is valid.
 */
export function validateKnowledgeBaseEntry(
  entry: KnowledgeBaseEntry,
): readonly string[] {
  const problems: string[] = [];
  if (entry.id.trim() === '') problems.push('id must not be empty');
  if (entry.title.trim() === '') problems.push('title must not be empty');
  if (entry.content.trim() === '') problems.push('content must not be empty');
  if (entry.confidence < 0 || entry.confidence > 1) problems.push('confidence must be between 0 and 1');
  problems.push(...credentialProblems('title', entry.title));
  problems.push(...credentialProblems('content', entry.content));
  problems.push(...credentialProblems('tags', entry.tags.join('\n')));
  return problems;
}
