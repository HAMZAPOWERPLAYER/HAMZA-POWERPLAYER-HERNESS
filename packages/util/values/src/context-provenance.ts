/**
 * Context provenance and stale-context detection.
 *
 * Records where retrieved context came from (source, range, version, retrieval
 * method, observation vs summary) and detects when a source has changed since
 * retrieval. This module performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/context-provenance
 */

/** How a piece of context was obtained. */
export type RetrievalMethod = 'direct-read' | 'search' | 'summary' | 'user-provided' | 'tool-output';

/** Whether the context is a direct observation or a derived summary. */
export type ObservationKind = 'observed' | 'summarized' | 'inferred';

/** Provenance for one piece of context. */
export interface ContextProvenance {
  /** Source file or document identifier. */
  readonly source: string;
  /** Line range or section, when known. */
  readonly range?: string;
  /** Source version or modification state, when known. */
  readonly sourceVersion?: string;
  /** How the context was retrieved. */
  readonly retrievalMethod: RetrievalMethod;
  /** Whether the content is observed, summarized, or inferred. */
  readonly observationKind: ObservationKind;
  /** Timestamp of retrieval in milliseconds since epoch. */
  readonly retrievedAt: number;
}

/** A change in a source since retrieval. */
export interface StaleContextSignal {
  /** The affected source. */
  readonly source: string;
  /** Why the context is considered stale. */
  readonly reason: string;
}

/**
 * Whether a retrieved context is stale given the current source version.
 * @param provenance - provenance of the retrieved context.
 * @param currentVersion - the current source version or modification state.
 * @returns a stale signal when stale, otherwise null.
 */
export function detectStaleContext(
  provenance: ContextProvenance,
  currentVersion: string | undefined,
): StaleContextSignal | null {
  if (provenance.sourceVersion === undefined || currentVersion === undefined) {
    return null;
  }
  if (provenance.sourceVersion === currentVersion) {
    return null;
  }
  return {
    source: provenance.source,
    reason: `source version changed from ${provenance.sourceVersion} to ${currentVersion}`,
  };
}

/**
 * Whether a provenance record is trustworthy enough to support an edit.
 * Summarized or inferred content is a hint, not authoritative source.
 * @param provenance - provenance to evaluate.
 * @returns whether the context may be treated as authoritative source.
 */
export function isAuthoritativeContext(provenance: ContextProvenance): boolean {
  return provenance.observationKind === 'observed' && provenance.retrievalMethod === 'direct-read';
}

/**
 * Format a provenance record as a concise string.
 * @param provenance - provenance to format.
 * @returns a human-readable provenance string.
 */
export function formatProvenance(provenance: ContextProvenance): string {
  const range = provenance.range === undefined ? '' : `:${provenance.range}`;
  const version = provenance.sourceVersion === undefined ? '' : `@${provenance.sourceVersion}`;
  return `${provenance.source}${range}${version} (${provenance.retrievalMethod}, ${provenance.observationKind})`;
}
