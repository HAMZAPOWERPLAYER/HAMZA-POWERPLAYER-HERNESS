/**
 * Game UI and game flow model.
 *
 * Represents UI state, screen transitions, and game flow states (main menu,
 * pause, gameplay, game over, victory). All helpers are pure: they compute UI
 * state transitions from caller-supplied input, perform no I/O, and hold no
 * state.
 *
 * @module @deepseek-ai/dsh-util-values/game-ui
 */

/** UI screen type. */
export type UIScreen =
  | 'main-menu'
  | 'settings'
  | 'pause'
  | 'hud'
  | 'inventory'
  | 'dialogue'
  | 'loading'
  | 'game-over'
  | 'victory'
  | 'options';

/** One UI screen state. */
export interface UIScreenState {
  /** Screen identifier. */
  readonly id: UIScreen;
  /** Whether the screen is visible. */
  readonly visible: boolean;
  /** Whether the screen blocks input to other screens. */
  readonly modal: boolean;
  /** Whether the screen can be closed by the player. */
  readonly closable: boolean;
  /** Stack depth for stacked screens. */
  readonly stackDepth: number;
}

/** UI state. */
export interface UIState {
  /** Currently visible screens, in stack order. */
  readonly screens: readonly UIScreenState[];
  /** Currently focused screen, if any. */
  readonly focused: UIScreen | null;
  /** Whether any modal screen is active. */
  readonly modalActive: boolean;
  /** Whether any screen is showing a loading state. */
  readonly loading: boolean;
  /** Error message, if any. */
  readonly errorMessage: string | null;
}

/** UI action result. */
export interface UIActionResult {
  /** New UI state. */
  readonly state: UIState;
  /** Whether the screen changed. */
  readonly screenChanged: boolean;
  /** Previous screen, if changed. */
  readonly previousScreen: UIScreen | null;
  /** New screen, if changed. */
  readonly newScreen: UIScreen | null;
}

/** Default UI state. */
export const DEFAULT_UI_STATE: UIState = {
  screens: [
    { id: 'main-menu', visible: true, modal: true, closable: false, stackDepth: 0 },
  ],
  focused: 'main-menu',
  modalActive: true,
  loading: false,
  errorMessage: null,
};

/**
 * Show a UI screen, appending it to the stack when it is not present yet.
 *
 * @param state - current UI state.
 * @param screenId - screen to show.
 * @param modal - whether the shown screen blocks input to other screens.
 * @param closable - whether the player can close the shown screen.
 * @returns the state with the screen visible and focused, or the unchanged state when the screen is already visible.
 */
export function showScreen(
  state: UIState,
  screenId: UIScreen,
  modal: boolean,
  closable: boolean,
): UIActionResult {
  const alreadyVisible = state.screens.some((s) => s.id === screenId && s.visible);
  if (alreadyVisible) {
    return {
      state,
      screenChanged: false,
      previousScreen: null,
      newScreen: null,
    };
  }

  // Focus must land on a screen that exists, so a screen absent from the stack is appended.
  const baseScreens: readonly UIScreenState[] = state.screens.some((s) => s.id === screenId)
    ? state.screens
    : [...state.screens, { id: screenId, visible: true, modal, closable, stackDepth: state.screens.length }];

  const newScreens = baseScreens.map((s) => ({
    ...s,
    visible: s.id === screenId ? true : s.visible,
    stackDepth: s.stackDepth + 1,
  }));

  // If not modal, hide other non-modal screens
  const finalScreens = modal
    ? newScreens.map((s) => ({
        ...s,
        visible: s.id === screenId ? true : s.visible && s.modal,
      }))
    : newScreens;

  const previousScreen = state.focused;
  const newScreen = screenId;

  return {
    state: {
      screens: finalScreens,
      focused: screenId,
      modalActive: finalScreens.some((s) => s.modal && s.visible),
      loading: state.loading,
      errorMessage: state.errorMessage,
    },
    screenChanged: true,
    previousScreen,
    newScreen,
  };
}

/**
 * Hide a UI screen.
 *
 * @param state - current UI state.
 * @param screenId - screen to hide.
 * @returns the state with the screen hidden and the next visible screen focused,
 * or the unchanged state when the screen is absent or already hidden.
 */
export function hideScreen(
  state: UIState,
  screenId: UIScreen,
): UIActionResult {
  const index = state.screens.findIndex((s) => s.id === screenId);
  if (index === -1 || !state.screens[index]!.visible) {
    return {
      state,
      screenChanged: false,
      previousScreen: null,
      newScreen: null,
    };
  }

  const newScreens = state.screens.map((s) =>
    s.id === screenId ? { ...s, visible: false } : s,
  );

  // Find next visible screen to focus
  const nextVisible = newScreens.find((s) => s.visible && s.id !== screenId);
  const newFocused = nextVisible ? nextVisible.id : null;

  return {
    state: {
      screens: newScreens,
      focused: newFocused,
      modalActive: newScreens.some((s) => s.modal && s.visible),
      loading: state.loading,
      errorMessage: state.errorMessage,
    },
    screenChanged: true,
    previousScreen: screenId,
    newScreen: newFocused,
  };
}

/**
 * Show a loading screen.
 *
 * @param state - current UI state.
 * @param loading - whether the UI reports a loading state.
 * @param message - error message to show, or null for none.
 * @returns the state carrying the loading flag and message; no screen changes.
 */
export function showLoading(
  state: UIState,
  loading: boolean,
  message: string | null,
): UIActionResult {
  return {
    state: {
      ...state,
      loading,
      errorMessage: message,
    },
    screenChanged: false,
    previousScreen: null,
    newScreen: null,
  };
}

/**
 * Show an error message.
 *
 * @param state - current UI state.
 * @param message - error message to display.
 * @returns the state carrying the error message; no screen changes.
 */
export function showError(
  state: UIState,
  message: string,
): UIActionResult {
  return {
    state: {
      ...state,
      errorMessage: message,
    },
    screenChanged: false,
    previousScreen: null,
    newScreen: null,
  };
}

/**
 * Clear error message.
 *
 * @param state - current UI state.
 * @returns the state with no error message; no screen changes.
 */
export function clearError(state: UIState): UIActionResult {
  return {
    state: {
      ...state,
      errorMessage: null,
    },
    screenChanged: false,
    previousScreen: null,
    newScreen: null,
  };
}

/**
 * Validate UI state consistency.
 *
 * @param state - UI state to validate.
 * @returns one message per consistency problem found, empty when the state is consistent.
 */
export function validateUIState(state: UIState): readonly string[] {
  const problems: string[] = [];

  const visibleScreens = state.screens.filter((s) => s.visible);
  if (visibleScreens.length === 0) {
    problems.push('at least one screen must be visible');
  }

  const modalScreens = visibleScreens.filter((s) => s.modal);
  if (modalScreens.length > 1) {
    problems.push('multiple modal screens are visible simultaneously');
  }

  if (state.focused !== null && !state.screens.some((s) => s.id === state.focused && s.visible)) {
    problems.push(`focused screen '${state.focused}' is not visible`);
  }

  return problems;
}
