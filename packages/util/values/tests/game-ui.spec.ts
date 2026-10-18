import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UI_STATE,
  clearError,
  hideScreen,
  showError,
  showLoading,
  showScreen,
  validateUIState,
} from '../src/index.ts'
import type { UIState } from '../src/index.ts'

/** A visible modal main menu with a hidden, closable settings screen. */
const withSettings: UIState = {
  screens: [
    { id: 'main-menu', visible: true, modal: true, closable: false, stackDepth: 0 },
    { id: 'settings', visible: false, modal: false, closable: true, stackDepth: 1 },
  ],
  focused: 'main-menu',
  modalActive: true,
  loading: false,
  errorMessage: null,
}

/** A visible modal main menu, a visible non-modal hud, and a hidden modal pause screen. */
const withHud: UIState = {
  screens: [
    { id: 'main-menu', visible: true, modal: true, closable: false, stackDepth: 0 },
    { id: 'hud', visible: true, modal: false, closable: false, stackDepth: 1 },
    { id: 'pause', visible: false, modal: true, closable: true, stackDepth: 2 },
  ],
  focused: 'hud',
  modalActive: true,
  loading: false,
  errorMessage: null,
}

/** A visible non-modal hud with a hidden non-modal inventory screen and no modal activity. */
const nonModalPair: UIState = {
  screens: [
    { id: 'hud', visible: true, modal: false, closable: false, stackDepth: 0 },
    { id: 'inventory', visible: false, modal: false, closable: true, stackDepth: 1 },
  ],
  focused: 'hud',
  modalActive: false,
  loading: false,
  errorMessage: null,
}

/** Two visible screens where the focused settings screen sits above the main menu. */
const twoVisible: UIState = {
  screens: [
    { id: 'main-menu', visible: true, modal: true, closable: false, stackDepth: 0 },
    { id: 'settings', visible: true, modal: false, closable: true, stackDepth: 1 },
  ],
  focused: 'settings',
  modalActive: true,
  loading: false,
  errorMessage: null,
}

describe('DEFAULT_UI_STATE', () => {
  it('starts on a visible, modal main menu', () => {
    expect(DEFAULT_UI_STATE.focused).toBe('main-menu')
    expect(DEFAULT_UI_STATE.modalActive).toBe(true)
    expect(DEFAULT_UI_STATE.loading).toBe(false)
    expect(DEFAULT_UI_STATE.errorMessage).toBeNull()
    expect(DEFAULT_UI_STATE.screens).toEqual([
      { id: 'main-menu', visible: true, modal: true, closable: false, stackDepth: 0 },
    ])
  })
})

describe('showScreen', () => {
  it('reveals a hidden screen and reports the transition', () => {
    const result = showScreen(withSettings, 'settings', false, true)
    expect(result.screenChanged).toBe(true)
    expect(result.previousScreen).toBe('main-menu')
    expect(result.newScreen).toBe('settings')
    expect(result.state.focused).toBe('settings')
    expect(result.state.screens).toHaveLength(2)
    const settings = result.state.screens.filter((s) => s.id === 'settings')
    expect(settings).toHaveLength(1)
    expect(settings[0]!.visible).toBe(true)
    expect(validateUIState(result.state)).toEqual([])
  })

  it('does not mutate the input state', () => {
    showScreen(withSettings, 'settings', false, true)
    expect(withSettings.focused).toBe('main-menu')
    expect(withSettings.screens.filter((s) => s.id === 'settings').map((s) => s.visible)).toEqual([false])
  })

  it('is a no-op when the screen is already visible', () => {
    const result = showScreen(withSettings, 'main-menu', true, false)
    expect(result.screenChanged).toBe(false)
    expect(result.previousScreen).toBeNull()
    expect(result.newScreen).toBeNull()
    expect(result.state).toBe(withSettings)
  })

  it('hides visible non-modal screens when showing a modal screen', () => {
    const result = showScreen(withHud, 'pause', true, false)
    expect(result.state.focused).toBe('pause')
    expect(result.state.modalActive).toBe(true)
    expect(result.state.screens.filter((s) => s.id === 'hud').map((s) => s.visible)).toEqual([false])
    expect(result.state.screens.filter((s) => s.id === 'pause').map((s) => s.visible)).toEqual([true])
  })

  it('keeps other screens visible when showing a non-modal screen', () => {
    const result = showScreen(nonModalPair, 'inventory', false, true)
    expect(result.state.focused).toBe('inventory')
    expect(result.state.screens.every((s) => s.visible)).toBe(true)
    expect(result.state.modalActive).toBe(false)
    expect(validateUIState(result.state)).toEqual([])
  })

  it('adds a screen that is not in the stack yet', () => {
    const result = showScreen(DEFAULT_UI_STATE, 'hud', false, true)
    expect(result.screenChanged).toBe(true)
    expect(result.previousScreen).toBe('main-menu')
    expect(result.newScreen).toBe('hud')
    expect(result.state.focused).toBe('hud')
    expect(result.state.screens).toHaveLength(2)
    const hud = result.state.screens.filter((s) => s.id === 'hud')
    expect(hud).toHaveLength(1)
    expect(hud[0]).toMatchObject({ visible: true, modal: false, closable: true })
    expect(validateUIState(result.state)).toEqual([])
  })

  it('preserves loading and error state', () => {
    const busy: UIState = { ...withSettings, loading: true, errorMessage: 'save failed' }
    const result = showScreen(busy, 'settings', false, true)
    expect(result.state.loading).toBe(true)
    expect(result.state.errorMessage).toBe('save failed')
  })
})

describe('hideScreen', () => {
  it('hides a visible screen and moves focus to the next visible screen', () => {
    const result = hideScreen(twoVisible, 'settings')
    expect(result.screenChanged).toBe(true)
    expect(result.previousScreen).toBe('settings')
    expect(result.newScreen).toBe('main-menu')
    expect(result.state.focused).toBe('main-menu')
    expect(result.state.modalActive).toBe(true)
    expect(result.state.screens.filter((s) => s.id === 'settings').map((s) => s.visible)).toEqual([false])
    expect(twoVisible.screens.filter((s) => s.id === 'settings').map((s) => s.visible)).toEqual([true])
  })

  it('is a no-op when the screen is not in the stack', () => {
    const result = hideScreen(withSettings, 'victory')
    expect(result.screenChanged).toBe(false)
    expect(result.previousScreen).toBeNull()
    expect(result.newScreen).toBeNull()
    expect(result.state).toBe(withSettings)
  })

  it('is a no-op when the screen is already hidden', () => {
    const result = hideScreen(withSettings, 'settings')
    expect(result.screenChanged).toBe(false)
    expect(result.state).toBe(withSettings)
  })

  it('clears focus when the last visible screen is hidden', () => {
    const result = hideScreen(DEFAULT_UI_STATE, 'main-menu')
    expect(result.screenChanged).toBe(true)
    expect(result.previousScreen).toBe('main-menu')
    expect(result.newScreen).toBeNull()
    expect(result.state.focused).toBeNull()
    expect(result.state.modalActive).toBe(false)
    expect(validateUIState(result.state)).toEqual(['at least one screen must be visible'])
  })

  it('preserves loading and error state', () => {
    const busy: UIState = { ...twoVisible, loading: true, errorMessage: 'save failed' }
    const result = hideScreen(busy, 'settings')
    expect(result.screenChanged).toBe(true)
    expect(result.state.loading).toBe(true)
    expect(result.state.errorMessage).toBe('save failed')
  })
})

describe('showLoading', () => {
  it('turns loading on and records the message', () => {
    const result = showLoading(withSettings, true, 'loading level')
    expect(result.state.loading).toBe(true)
    expect(result.state.errorMessage).toBe('loading level')
    expect(result.screenChanged).toBe(false)
    expect(result.previousScreen).toBeNull()
    expect(result.newScreen).toBeNull()
    expect(result.state.focused).toBe('main-menu')
  })

  it('turns loading off and clears the message', () => {
    const busy: UIState = { ...withSettings, loading: true, errorMessage: 'loading level' }
    const result = showLoading(busy, false, null)
    expect(result.state.loading).toBe(false)
    expect(result.state.errorMessage).toBeNull()
  })
})

describe('showError', () => {
  it('sets the error message without changing the screen', () => {
    const result = showError(withSettings, 'disk full')
    expect(result.state.errorMessage).toBe('disk full')
    expect(result.state.loading).toBe(false)
    expect(result.state.focused).toBe('main-menu')
    expect(result.screenChanged).toBe(false)
    expect(result.previousScreen).toBeNull()
    expect(result.newScreen).toBeNull()
  })

  it('replaces an earlier error message', () => {
    const first = showError(withSettings, 'first')
    const second = showError(first.state, 'second')
    expect(second.state.errorMessage).toBe('second')
  })
})

describe('clearError', () => {
  it('clears the error message and keeps the rest of the state', () => {
    const errored: UIState = { ...withSettings, errorMessage: 'boom' }
    const result = clearError(errored)
    expect(result.state.errorMessage).toBeNull()
    expect(result.state.loading).toBe(false)
    expect(result.state.focused).toBe('main-menu')
    expect(result.screenChanged).toBe(false)
  })

  it('keeps a null error message null', () => {
    const result = clearError(withSettings)
    expect(result.state.errorMessage).toBeNull()
  })
})

describe('validateUIState', () => {
  it('accepts the default state', () => {
    expect(validateUIState(DEFAULT_UI_STATE)).toEqual([])
  })

  it('accepts a state with no focused screen', () => {
    const noFocus: UIState = { ...withSettings, focused: null }
    expect(validateUIState(noFocus)).toEqual([])
  })

  it('rejects a state with no visible screen', () => {
    const hidden: UIState = {
      screens: [{ id: 'main-menu', visible: false, modal: true, closable: false, stackDepth: 0 }],
      focused: null,
      modalActive: false,
      loading: false,
      errorMessage: null,
    }
    expect(validateUIState(hidden)).toEqual(['at least one screen must be visible'])
  })

  it('rejects multiple visible modal screens', () => {
    const stacked: UIState = {
      screens: [
        { id: 'main-menu', visible: true, modal: true, closable: false, stackDepth: 0 },
        { id: 'pause', visible: true, modal: true, closable: true, stackDepth: 1 },
      ],
      focused: 'pause',
      modalActive: true,
      loading: false,
      errorMessage: null,
    }
    expect(validateUIState(stacked)).toEqual(['multiple modal screens are visible simultaneously'])
  })

  it('reports a focused screen that is not visible', () => {
    const staleFocus: UIState = { ...withSettings, focused: 'settings' }
    expect(validateUIState(staleFocus)).toEqual(["focused screen 'settings' is not visible"])
  })

  it('reports every problem in order', () => {
    const broken: UIState = {
      screens: [
        { id: 'main-menu', visible: false, modal: true, closable: false, stackDepth: 0 },
        { id: 'pause', visible: false, modal: true, closable: true, stackDepth: 1 },
      ],
      focused: 'pause',
      modalActive: false,
      loading: false,
      errorMessage: null,
    }
    expect(validateUIState(broken)).toEqual([
      'at least one screen must be visible',
      "focused screen 'pause' is not visible",
    ])
  })
})
