/**
 * HERNES codebase understanding plugin.
 *
 * Wires codebase-understanding pure modules from
 * @deepseek-ai/dsh-util-values into the Cordis application. Provides
 * dependency graph building, file ranking, and affected-file analysis for
 * codebase understanding workflows.
 *
 * @module @deepseek-ai/dsh-hernes-codebase-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type AffectedFiles,
  type DependencyGraph,
  type ObservedFile,
  type RankedFile,
  buildDependencyGraph,
  findAffectedFiles,
  rankFilesByRelevance,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to enable codebase understanding. */
  enableUnderstanding: z.boolean().default(true),
  /** Maximum number of ranked files to return. */
  maxRankedFiles: z.number().int().positive().default(50),
})

type Config = z.infer<typeof Config>

/** Codebase understanding service. */
export class HernesCodebaseService extends Service<Config> {
  static inject = ['fs']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesCodebase')
    this.config = config
    ctx.effect(() => {
      // cleanup on dispose
    })
  }

  /**
   * Build a dependency graph from observed files.
   * @param files - observed files to scan.
   * @returns the dependency graph.
   */
  buildGraph(files: readonly ObservedFile[]): DependencyGraph {
    return buildDependencyGraph(files)
  }

  /**
   * Rank files by relevance to query terms.
   * @param files - observed files to rank.
   * @param queryTerms - search terms to match against file content.
   * @returns files ranked by relevance score, highest first.
   */
  rankFiles(files: readonly ObservedFile[], queryTerms: readonly string[]): readonly RankedFile[] {
    return rankFilesByRelevance(files, queryTerms)
  }

  /**
   * Find files affected by changes.
   * @param graph - dependency graph.
   * @param changedFiles - files that changed.
   * @returns affected files and their impact.
   */
  findAffected(graph: DependencyGraph, changedFiles: readonly string[]): AffectedFiles {
    return findAffectedFiles(graph, changedFiles)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesCodebase?: HernesCodebaseService
  }
}

export default HernesCodebaseService
