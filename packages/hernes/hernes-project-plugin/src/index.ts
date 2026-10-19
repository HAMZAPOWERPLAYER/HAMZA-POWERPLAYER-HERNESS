/**
 * HERNES project detection plugin.
 *
 * Wires project-kind and workspace-discovery pure modules from
 * @deepseek-ai/dsh-util-values into the Cordis application. Detects project
 * type at session start and summarizes the workspace.
 *
 * @module @deepseek-ai/dsh-hernes-project-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type ProjectKind,
  type WorkspaceSummary,
  detectProjectKinds,
  summarizeWorkspace,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to enable project detection. */
  enableDetection: z.boolean().default(true),
  /** Directories to ignore during detection. */
  ignorePatterns: z.array(z.string()).default(['node_modules', 'lib', 'dist']),
})

type Config = z.infer<typeof Config>

/** Project detection service. */
export class HernesProjectService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesProject')
    this.config = config
    ctx.effect(() => {
      // cleanup on dispose
    })
  }

  /**
   * Detect project kinds from file markers.
   * @param markers - observed file markers.
   * @returns the detected project kinds.
   */
  detectProjects(markers: readonly string[]): readonly ProjectKind[] {
    return detectProjectKinds(markers)
  }

  /**
   * Summarize the workspace.
   * @param files - observed file paths.
   * @returns the workspace summary.
   */
  summarizeWorkspace(files: readonly string[]): WorkspaceSummary {
    return summarizeWorkspace(files)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesProject?: HernesProjectService
  }
}

export default HernesProjectService
