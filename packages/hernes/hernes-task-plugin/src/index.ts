/**
 * HERNES task lifecycle plugin.
 *
 * Wires task-state, completion-report, and verification pure modules from
 * @deepseek-ai/dsh-util-values into the Cordis application through documented
 * extension points. Provides task lifecycle tracking, completion report
 * assembly, and evidence-based claim verification as a service.
 *
 * @module @deepseek-ai/dsh-hernes-task-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type CompletionReport,
  type CompletionReportInput,
  type TaskRecord,
  createCompletionReport,
  createTaskRecord,
  isCompletionVerified,
  transitionTaskState,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to enable task lifecycle tracking. */
  enableTaskTracking: z.boolean().default(true),
  /** Whether to enable completion report assembly. */
  enableCompletionReport: z.boolean().default(true),
  /** Whether to enforce verification before completion. */
  enforceVerification: z.boolean().default(true),
})

type Config = z.infer<typeof Config>

/** Task lifecycle service. */
export class HernesTaskService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  private reports = new Map<string, CompletionReport>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesTask')
    this.config = config
    ctx.effect(() => {
      this.reports.clear()
    })
  }

  /**
   * Create a new task record.
   * @param id - stable task identifier.
   * @returns the new task record.
   */
  createTask(id: string): TaskRecord {
    return createTaskRecord(id)
  }

  /**
   * Transition a task to a new state.
   * @param record - current task record.
   * @param to - target state.
   * @param note - optional summary of why the transition happened.
   * @returns a new task record in the target state.
   */
  transitionTask(record: TaskRecord, to: string, note?: string): TaskRecord {
    return transitionTaskState(record, to as never, note)
  }

  /**
   * Assemble a completion report.
   * @param input - report fields.
   * @returns a complete report.
   */
  createReport(input: CompletionReportInput): CompletionReport {
    const report = createCompletionReport(input)
    this.reports.set(input.taskId, report)
    return report
  }

  /**
   * Whether a completion report supports a claim of successful completion.
   * @param report - the report to inspect.
   * @returns true only when all mandatory criteria are met.
   */
  isReportVerified(report: CompletionReport): boolean {
    return isCompletionVerified(report)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesTask?: HernesTaskService
  }
}

export default HernesTaskService
