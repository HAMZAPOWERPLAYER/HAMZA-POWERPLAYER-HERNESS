/**
 * HERNES lifecycle plugin.
 *
 * Wires the HERNES task lifecycle into Cordis session events
 * (`turn/start`, `turn/end`, `step/start`, `step/end`) through documented
 * extension points. Emits evidence when sessions and steps complete, providing
 * the "what was actually executed" evidence layer for claim verification.
 *
 * @module @deepseek-ai/dsh-hernes-lifecycle-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type CompletionReportInput,
  type TaskRecord,
  createCompletionReport,
  createTaskRecord,
  isTerminalTaskState,
  transitionTaskState,
} from '@deepseek-ai/dsh-util-values'

/** Turn end reason, matched to Cordis session event shape. */
export type TurnEndReason = { readonly kind: string }

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to emit task events on session lifecycle transitions. */
  emitTaskEvents: z.boolean().default(true),
  /** Whether to auto-complete tasks when a turn ends successfully. */
  autoCompleteOnTurnEnd: z.boolean().default(false),
})

type Config = z.infer<typeof Config>

/** Lifecycle service. */
export class HernesLifecycleService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  private activeTasks = new Map<string, TaskRecord>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesLifecycle')
    this.config = config
    ctx.effect(() => {
      this.activeTasks.clear()
    })
  }

  /**
   * Hook into session turn start: record that a task began execution.
   * @param sessionId - session identifier.
   * @param turn - turn number.
   */
  onTurnStart(sessionId: string, turn: number): void {
    if (!this.config.emitTaskEvents) return
    const taskId = `${sessionId}:turn:${turn}`
    this.activeTasks.set(taskId, createTaskRecord(taskId))
  }

  /**
   * Hook into session turn end: complete or fail tasks based on outcome.
   * @param sessionId - session identifier.
   * @param turn - turn number.
   * @param reason - turn end reason.
   * @param success - whether the turn succeeded.
   */
  onTurnEnd(sessionId: string, turn: number, reason: TurnEndReason, success: boolean): void {
    if (!this.config.emitTaskEvents) return
    const taskId = `${sessionId}:turn:${turn}`
    const record = this.activeTasks.get(taskId)
    if (!record) return

    const next = success ? 'completed' : 'failed'
    if (isTerminalTaskState(record.state)) {
      this.activeTasks.delete(taskId)
      return
    }

    const updated = transitionTaskState(record, next, reason.kind)
    this.activeTasks.set(taskId, updated)

    if (success && this.config.autoCompleteOnTurnEnd && isTerminalTaskState(updated.state)) {
      this.activeTasks.delete(taskId)
    }
  }

  /**
   * Hook into session step start: record sub-task within a turn.
   * @param sessionId - session identifier.
   * @param turn - turn number.
   * @param step - step number.
   */
  onStepStart(sessionId: string, turn: number, step: number): void {
    if (!this.config.emitTaskEvents) return
    const taskId = `${sessionId}:turn:${turn}:step:${step}`
    this.activeTasks.set(taskId, createTaskRecord(taskId))
  }

  /**
   * Hook into session step end: complete or fail sub-tasks.
   * @param sessionId - session identifier.
   * @param turn - turn number.
   * @param step - step number.
   * @param success - whether the step succeeded.
   */
  onStepEnd(sessionId: string, turn: number, step: number, success: boolean): void {
    if (!this.config.emitTaskEvents) return
    const taskId = `${sessionId}:turn:${turn}:step:${step}`
    const record = this.activeTasks.get(taskId)
    if (!record || isTerminalTaskState(record.state)) return

    const updated = transitionTaskState(record, success ? 'completed' : 'failed')
    this.activeTasks.set(taskId, updated)

    if (success && isTerminalTaskState(updated.state)) {
      this.activeTasks.delete(taskId)
    }
  }

  /**
   * Assemble a completion report from active task state.
   * @param taskId - task identifier.
   * @param input - report input overrides.
   * @returns a completion report.
   */
  createReport(taskId: string, input: Omit<CompletionReportInput, 'taskId'>): CompletionReport {
    return createCompletionReport({ taskId, ...input })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesLifecycle?: HernesLifecycleService
  }
}

export default HernesLifecycleService
