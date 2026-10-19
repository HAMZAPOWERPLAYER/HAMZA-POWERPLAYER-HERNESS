/**
 * Multi-file edit integration plugin for HERNES.
 *
 * Wires multi-file-edit validation primitives from
 * @deepseek-ai/dsh-util-values into file editing workflows. Provides
 * precondition checking, edit validation, and change impact computation
 * for safe multi-file operations.
 *
 * @module @deepseek-ai/dsh-hernes-edit-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type EditValidationResult,
  type FileEdit,
  type EditedFile,
  validateEdit,
  validateEdits,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to require preconditions for edits. */
  requirePreconditions: z.boolean().default(true),
})

type Config = z.infer<typeof Config>

/** Multi-file edit service. */
export class HernesEditService extends Service<Config> {
  static inject = ['fs']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesEdit')
    this.config = config
    ctx.effect(() => {
      // cleanup on dispose
    })
  }

  /**
   * Validate an edit against observed file state.
   * @param edit - edit to validate.
   * @param observed - observed file states.
   * @returns validation result.
   */
  validateEdit(edit: FileEdit, observed: readonly EditedFile[]): EditValidationResult {
    return validateEdit(edit, observed)
  }

  /**
   * Validate many edits against observed file state.
   * @param edits - edits to validate.
   * @param observed - observed file states.
   * @returns aggregated validation result.
   */
  validateEdits(edits: readonly FileEdit[], observed: readonly EditedFile[]): EditValidationResult {
    return validateEdits(edits, observed)
  }

  /**
   * Whether all edits are valid.
   * @param result - validation result.
   * @returns whether every edit passed validation.
   */
  allValid(result: EditValidationResult): boolean {
    return result.allValid
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesEdit?: HernesEditService
  }
}

export default HernesEditService
