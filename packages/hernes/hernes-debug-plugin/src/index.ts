/**
 * HERNES debugging plugin.
 *
 * Wires error-memory and error-classification pure modules from
 * @deepseek-ai/dsh-util-values into the Cordis application. Provides
 * error classification, error memory storage, and debugging support.
 *
 * @module @deepseek-ai/dsh-hernes-debug-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type ClassifiedError,
  type ErrorMemoryEntry,
  type ErrorMemorySummary,
  classifyError,
  createErrorMemoryEntry,
  filterErrorMemoryByVersion,
  isRetryableError,
  revalidateErrorMemoryEntry,
  searchErrorMemory,
  summarizeErrorMemory,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to enable error memory. */
  enableErrorMemory: z.boolean().default(true),
  /** Maximum number of error entries to store. */
  maxEntries: z.number().int().positive().default(1000),
})

type Config = z.infer<typeof Config>

/** Debugging service. */
export class HernesDebugService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  private entries = new Map<string, ErrorMemoryEntry>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesDebug')
    this.config = config
    ctx.effect(() => {
      this.entries.clear()
    })
  }

  /**
   * Classify an error.
   * @param input - error input.
   * @returns the classified error.
   */
  classifyError(input: Parameters<typeof classifyError>[0]): ClassifiedError {
    return classifyError(input)
  }

  /**
   * Whether an error is retryable.
   * @param error - classified error.
   * @returns whether the error can be retried.
   */
  isRetryableError(error: ClassifiedError): boolean {
    return isRetryableError(error)
  }

  /**
   * Create an error memory entry.
   * @param params - entry parameters.
   * @returns the new entry.
   */
  createErrorMemoryEntry(params: {
    id: string
    rootCause: string
    fix: string
    affectedFile: string
    affectedVersions?: readonly string[]
    regressionTest?: string
    createdAt?: number
  }): ErrorMemoryEntry {
    const entry = createErrorMemoryEntry(params)
    this.entries.set(entry.id, entry)
    return entry
  }

  /**
   * Search error memory entries.
   * @param query - substring to match against.
   * @returns matching entries.
   */
  searchErrorMemory(query: string): readonly ErrorMemoryEntry[] {
    return searchErrorMemory(Array.from(this.entries.values()), query)
  }

  /**
   * Summarize error memory.
   * @returns summary of all entries.
   */
  summarizeErrorMemory(): ErrorMemorySummary {
    return summarizeErrorMemory(Array.from(this.entries.values()))
  }

  /**
   * Filter entries by version.
   * @param version - version substring to match.
   * @returns matching entries.
   */
  filterByVersion(version: string): readonly ErrorMemoryEntry[] {
    return filterErrorMemoryByVersion(Array.from(this.entries.values()), version)
  }

  /**
   * Revalidate an entry.
   * @param id - entry identifier.
   * @param now - epoch milliseconds.
   * @returns the revalidated entry.
   */
  revalidateEntry(id: string, now: number): ErrorMemoryEntry | undefined {
    const entry = this.entries.get(id)
    if (!entry) return undefined
    const updated = revalidateErrorMemoryEntry(entry, now)
    this.entries.set(id, updated)
    return updated
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesDebug?: HernesDebugService
  }
}

export default HernesDebugService
