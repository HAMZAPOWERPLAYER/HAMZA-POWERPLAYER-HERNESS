import { describe, expect, it } from 'vitest'
import { validateUiGameSync } from '../src/game-state-sync.ts'
import type { UIState, UIScreen, UIScreenState } from '../src/game-ui.ts'
import type { ProgressionMilestone, ProgressionState } from '../src/interaction-puzzle.ts'

/** A milestone whose required objective is not yet completed. */
const PENDING_MILESTONE: ProgressionMilestone = {
  id: 'm1',
  name: 'First Steps',
  description: 'Finish the first objective',
  requiredObjectives: ['o1'],
  unlockedCapabilities: [],
  complete: false,
}

/** The same milestone marked complete. */
const COMPLETED_MILESTONE: ProgressionMilestone = { ...PENDING_MILESTONE, complete: true }

function makeProgression(overrides: Partial<ProgressionState> = {}): ProgressionState {
  return {
    milestones: [PENDING_MILESTONE],
    completedObjectives: [],
    currentLevel: 'chapter-1',
    playTime: 60,
    ...overrides,
  }
}

function makeScreen(id: UIScreen, visible: boolean, modal: boolean): UIScreenState {
  return { id, visible, modal, closable: !modal, stackDepth: 0 }
}

function makeUi(screens: readonly UIScreenState[], overrides: Partial<UIState> = {}): UIState {
  const stacked = screens.map((screen, index) => ({ ...screen, stackDepth: index }))
  const visible = stacked.filter((screen) => screen.visible)
  return {
    screens: stacked,
    focused: visible[visible.length - 1]?.id ?? null,
    modalActive: stacked.some((screen) => screen.modal && screen.visible),
    loading: false,
    errorMessage: null,
    ...overrides,
  }
}

describe('validateUiGameSync', () => {
  it('reports a visible victory screen while milestones remain incomplete', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('victory', true, true)]),
      makeProgression(),
    )
    expect(issues).toEqual([
      {
        code: 'victory-without-win',
        severity: 'error',
        message: 'victory screen is visible but only 0 of 1 milestones are complete',
        suggestion: 'hide the victory screen until every milestone is complete',
      },
    ])
  })

  it('stays silent when the victory screen shows every milestone complete', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('victory', true, true)]),
      makeProgression({ milestones: [COMPLETED_MILESTONE] }),
    )
    expect(issues).toEqual([])
  })

  it('stays silent when a milestone-free progression cannot decide a win', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('victory', true, true)]),
      makeProgression({ milestones: [] }),
    )
    expect(issues).toEqual([])
  })

  it('reports a completed progression without a victory screen', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('hud', true, false)]),
      makeProgression({ milestones: [COMPLETED_MILESTONE] }),
    )
    expect(issues).toEqual([
      {
        code: 'win-without-victory-screen',
        severity: 'warning',
        message: 'every milestone is complete but the victory screen is not visible',
        suggestion: 'show the victory screen when the final milestone completes',
      },
    ])
  })

  it('stays silent while milestones are incomplete and the victory screen is hidden', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('hud', true, false)]),
      makeProgression(),
    )
    expect(issues).toEqual([])
  })

  it('reports the main menu while a level is current', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('main-menu', true, true)]),
      makeProgression(),
    )
    expect(issues).toEqual([
      {
        code: 'main-menu-during-active-run',
        severity: 'warning',
        message: "main menu is visible while level 'chapter-1' is current",
        suggestion: 'hide the main menu while a level is current, or clear currentLevel before showing it',
      },
    ])
  })

  it('stays silent on the main menu with no current level', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('main-menu', true, true)]),
      makeProgression({ currentLevel: null }),
    )
    expect(issues).toEqual([])
  })

  it('reports a hud that is hidden during active gameplay', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('hud', false, false), makeScreen('inventory', true, false)]),
      makeProgression(),
    )
    expect(issues).toEqual([
      {
        code: 'hud-hidden-during-gameplay',
        severity: 'warning',
        message:
          "hud is not visible while level 'chapter-1' is current, with no modal screen and no loading state",
        suggestion:
          'show the hud during active gameplay, or open a modal screen or set loading when the hud stays hidden',
      },
    ])
  })

  it('reports an absent hud during active gameplay', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('inventory', true, false)]),
      makeProgression(),
    )
    expect(issues.map((issue) => issue.code)).toEqual(['hud-hidden-during-gameplay'])
  })

  it('stays silent when the hud is visible during active gameplay', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('hud', true, false)]),
      makeProgression(),
    )
    expect(issues).toEqual([])
  })

  it('stays silent when a visible modal screen covers the hidden hud', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('hud', false, false), makeScreen('pause', true, true)]),
      makeProgression(),
    )
    expect(issues).toEqual([])
  })

  it('stays silent when loading hides the hud', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('hud', false, false)], { loading: true }),
      makeProgression(),
    )
    expect(issues).toEqual([])
  })

  it('orders issues by rule', () => {
    const issues = validateUiGameSync(
      makeUi([
        makeScreen('victory', true, false),
        makeScreen('main-menu', true, false),
        makeScreen('hud', false, false),
      ]),
      makeProgression(),
    )
    expect(issues.map((issue) => issue.code)).toEqual([
      'victory-without-win',
      'main-menu-during-active-run',
      'hud-hidden-during-gameplay',
    ])
    expect(issues.map((issue) => issue.severity)).toEqual(['error', 'warning', 'warning'])
  })

  it('reports only the hud issue for an empty screen stack during an active run', () => {
    const issues = validateUiGameSync(makeUi([]), makeProgression())
    expect(issues).toEqual([
      {
        code: 'hud-hidden-during-gameplay',
        severity: 'warning',
        message:
          "hud is not visible while level 'chapter-1' is current, with no modal screen and no loading state",
        suggestion:
          'show the hud during active gameplay, or open a modal screen or set loading when the hud stays hidden',
      },
    ])
  })

  it('reports no issue for empty inputs', () => {
    const issues = validateUiGameSync(
      makeUi([]),
      makeProgression({ milestones: [], currentLevel: null, playTime: 0 }),
    )
    expect(issues).toEqual([])
  })

  it('reports no issue for a milestone-free progression on the main menu', () => {
    const issues = validateUiGameSync(
      makeUi([makeScreen('main-menu', true, true)]),
      makeProgression({ milestones: [], completedObjectives: [], currentLevel: null }),
    )
    expect(issues).toEqual([])
  })

  it('leaves both inputs untouched and returns equal issues on a repeat call', () => {
    const ui = makeUi([makeScreen('victory', true, false), makeScreen('main-menu', true, false)])
    const progression = makeProgression()
    const uiBefore = structuredClone(ui)
    const progressionBefore = structuredClone(progression)
    const first = validateUiGameSync(ui, progression)
    const second = validateUiGameSync(ui, progression)
    expect(ui).toEqual(uiBefore)
    expect(progression).toEqual(progressionBefore)
    expect(second).toEqual(first)
    expect(first.length).toBeGreaterThan(0)
  })
})
