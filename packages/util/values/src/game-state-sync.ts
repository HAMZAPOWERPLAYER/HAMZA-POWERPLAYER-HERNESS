/**
 * Cross-checks of game UI screens against progression state.
 *
 * `validateUiGameSync` reads a UIState from ./game-ui.ts and a
 * ProgressionState from ./interaction-puzzle.ts and reports the
 * contradictions that both inputs can decide: a victory screen shown while
 * milestones stay incomplete, a completed milestone list without a victory
 * screen, the main menu shown while progression holds a current level, and
 * a hud that is not visible while a level is current with no visible modal
 * screen and no loading state.
 *
 * The win condition is at least one milestone with every milestone
 * complete. A progression without milestones carries no win condition, so
 * both victory checks stay silent. A run counts as active while
 * `currentLevel` is not null.
 *
 * Two further checks are not performed because the inputs cannot decide
 * them: a game-over screen against a failed or ended run, since
 * ProgressionState carries no failure or end flag; and a visible modal
 * screen against progression-expected overlays, since ProgressionState
 * carries no expected-overlay list.
 *
 * An empty result means no contradiction is decidable from the two inputs;
 * it does not mean the game state is complete or correct. Every helper is
 * pure: it reads only its arguments, performs no I/O, reads no clock, and
 * holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-state-sync
 */

import type { UIState, UIScreen } from './game-ui.ts'
import type { ProgressionState } from './interaction-puzzle.ts'

/** Severity of one sync issue; no rule emits `info` today. */
export type UiGameSyncSeverity = 'info' | 'warning' | 'error'

/**
 * Issue codes, one per cross-check rule, in the order `validateUiGameSync`
 * reports them: `victory-without-win` (a visible victory screen while at
 * least one milestone is incomplete), `win-without-victory-screen` (every
 * milestone complete while no victory screen is visible),
 * `main-menu-during-active-run` (a visible main menu while `currentLevel`
 * is not null), and `hud-hidden-during-gameplay` (no visible hud while
 * `currentLevel` is not null, with no visible modal screen and no loading
 * state).
 */
export type UiGameSyncCode =
  | 'victory-without-win'
  | 'win-without-victory-screen'
  | 'main-menu-during-active-run'
  | 'hud-hidden-during-gameplay'

/** One cross-check issue reported by {@link validateUiGameSync}. */
export interface UiGameSyncIssue {
  /** Stable identifier of the rule that reported the issue. */
  readonly code: UiGameSyncCode
  /** Severity of the issue; no rule emits `info` today. */
  readonly severity: UiGameSyncSeverity
  /** Human-readable description of the contradiction. */
  readonly message: string
  /** Actionable change that resolves the issue. */
  readonly suggestion: string
}

/**
 * Whether a screen is present and visible in the UI state.
 *
 * @param ui - UI state to inspect.
 * @param id - screen id to look for.
 * @returns `true` when a matching screen entry carries `visible`.
 */
function isVisible(ui: UIState, id: UIScreen): boolean {
  return ui.screens.some((screen) => screen.id === id && screen.visible)
}

/**
 * Whether any visible screen is modal. Modality is read from the screen
 * entries rather than `modalActive` so a stale summary flag cannot decide
 * an issue.
 *
 * @param ui - UI state to inspect.
 * @returns `true` when at least one visible screen is modal.
 */
function hasVisibleModal(ui: UIState): boolean {
  return ui.screens.some((screen) => screen.modal && screen.visible)
}

/**
 * Cross-check UI screens against progression state and report every
 * contradiction both inputs can decide. Issues are ordered by rule:
 * victory screen vs win condition, missed victory transition, main menu
 * over an active run, then the hud. A check whose inputs cannot decide the
 * outcome reports nothing; the module documentation lists the rules that
 * are not performed at all.
 *
 * @param ui - UI state whose visible screens are checked.
 * @param progression - progression state the screens must agree with.
 * @returns the issues in fixed rule order, empty when no contradiction is decidable from both inputs.
 */
export function validateUiGameSync(
  ui: UIState,
  progression: ProgressionState,
): readonly UiGameSyncIssue[] {
  const issues: UiGameSyncIssue[] = []
  const level = progression.currentLevel
  const winDecidable = progression.milestones.length > 0
  const winSatisfied =
    winDecidable && progression.milestones.every((milestone) => milestone.complete)
  const victoryVisible = isVisible(ui, 'victory')

  if (winDecidable && !winSatisfied && victoryVisible) {
    const total = progression.milestones.length
    const complete = progression.milestones.filter((milestone) => milestone.complete).length
    issues.push({
      code: 'victory-without-win',
      severity: 'error',
      message: `victory screen is visible but only ${complete} of ${total} milestones are complete`,
      suggestion: 'hide the victory screen until every milestone is complete',
    })
  }

  if (winSatisfied && !victoryVisible) {
    issues.push({
      code: 'win-without-victory-screen',
      severity: 'warning',
      message: 'every milestone is complete but the victory screen is not visible',
      suggestion: 'show the victory screen when the final milestone completes',
    })
  }

  if (level !== null && isVisible(ui, 'main-menu')) {
    issues.push({
      code: 'main-menu-during-active-run',
      severity: 'warning',
      message: `main menu is visible while level '${level}' is current`,
      suggestion: 'hide the main menu while a level is current, or clear currentLevel before showing it',
    })
  }

  if (level !== null && !hasVisibleModal(ui) && !ui.loading && !isVisible(ui, 'hud')) {
    issues.push({
      code: 'hud-hidden-during-gameplay',
      severity: 'warning',
      message: `hud is not visible while level '${level}' is current, with no modal screen and no loading state`,
      suggestion: 'show the hud during active gameplay, or open a modal screen or set loading when the hud stays hidden',
    })
  }

  return issues
}
