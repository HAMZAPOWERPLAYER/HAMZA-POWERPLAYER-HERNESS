/**
 * Unity C# script skeleton generation.
 *
 * Builds self-consistent Unity MonoBehaviour script skeletons for the design
 * tasks derived by `game-design-tasks`: player movement, enemy AI,
 * interaction, UI control, and saving. Generation is pure string building
 * over the in-memory inputs: no Unity project, Editor, compiler, or file
 * system is involved, and the output is never compile-verified. Every
 * result carries honesty warnings: the text is a skeleton for an agent to
 * review and adapt, the Unity API surface is assumed from convention and
 * must be checked against the target project's Unity version, and each
 * `requiredEngineApis` entry of a supplied task that the generated file does
 * not cover is named in a warning. All helpers are pure: they derive output
 * from caller-supplied inputs, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/unity-codegen
 */

import type { GameDesignTask } from './game-design-tasks.ts'

/** Unity script kinds the generator can emit. */
export type UnityScriptKind =
  | 'player-movement'
  | 'enemy-ai'
  | 'interaction'
  | 'ui-controller'
  | 'save-system'

/** Parameters for {@link generateUnityScript}. */
export interface GenerateUnityScriptParams {
  /**
   * Design task the script adapts. Supplies the file header identity lines
   * and the required-engine-API coverage check. Omitted when the script is
   * not derived from a task.
   */
  readonly task?: GameDesignTask
  /** Script kind to generate. */
  readonly kind: UnityScriptKind
  /**
   * Class name override. Used verbatim when non-blank; the kind's default
   * class name applies when omitted or blank.
   */
  readonly className?: string
  /**
   * Namespace wrapper for the generated class. Used verbatim when non-blank;
   * the class stays in the global namespace when omitted or blank.
   */
  readonly namespace?: string
}

/** Result of {@link generateUnityScript}. */
export interface UnityScriptResult {
  /** Destination path of the script inside a Unity project. */
  readonly path: string
  /** The generated C# skeleton text, ending with exactly one newline. */
  readonly content: string
  /**
   * Honesty and coverage warnings in emission order: the skeleton disclaimer,
   * the Unity version verification reminder, then one warning per required
   * engine API the generated file does not cover.
   */
  readonly warnings: readonly string[]
}

/** Default class name per script kind. */
const DEFAULT_CLASS_NAMES: Readonly<Record<string, string>> = {
  'player-movement': 'PlayerMovementController',
  'enemy-ai': 'EnemyAiController',
  'interaction': 'InteractionController',
  'ui-controller': 'UiController',
  'save-system': 'SaveSystem',
}

/** One-line note per kind naming the harness model the skeleton mirrors. */
const KIND_MIRRORS: Readonly<Record<UnityScriptKind, string>> = {
  'player-movement':
    'the player-movement model: MovementState (velocity, facing, grounded, sprinting, crouching, speedMultiplier), MovementInput (forward, strafe, jumpPressed, sprint, crouch), and MovementConfig (baseSpeed, sprintMultiplier, crouchMultiplier, jumpImpulse, gravity, groundFriction, airControl, maxGroundSpeed, maxAirSpeed)',
  'enemy-ai':
    'the enemy-ai model: AiState (Idle, Patrol, Investigate, Chase, Attack, Retreat, Stun, Dead), AiConfig (detectionRange, attackRange, patrolSpeed, chaseSpeed, retreatSpeed, attackCooldown, stunDuration), and the AIStateInstance fields (state, timeInState, stunned, targetPosition, patrolIndex)',
  'interaction':
    'the interaction model: a trigger Collider reports the interactable and a key press dispatches the action',
  'ui-controller':
    'the screen-flow model: each screen is a root GameObject bound to the project UI toolkit',
  'save-system':
    'the save-data model: an autosave Coroutine writes serialized state on an interval',
}

/** Honesty warning emitted for every generated script. */
const SKELETON_WARNING =
  'Generated script is a skeleton for an agent to review and adapt; it is not compiled code and has not been compiled, imported, or run in a Unity Editor.'

/** Honesty warning naming the assumed Unity API surface. */
const UNITY_VERSION_WARNING =
  "The Unity API surface (MonoBehaviour, Transform, Rigidbody, CharacterController, Input, Physics, GameObject, Debug, Coroutine) is assumed from convention; verify every API against the target project's Unity version before use."

/**
 * Generate one Unity C# script skeleton.
 *
 * The generated content is a plausible, self-consistent skeleton for an
 * agent to review and adapt, not compiled code: no compile, import, or
 * Editor run is performed or claimed, and the Unity API surface used by the
 * skeletons is assumed from convention rather than verified against a target
 * project. When `task` supplies `requiredEngineApis`, each entry whose name
 * tokens are all present in the generated content counts as covered; every
 * other entry produces a warning naming it, so the agent extends the
 * skeleton instead of assuming coverage. Generation is deterministic: the
 * same input produces byte-identical output.
 *
 * @param params - generation parameters: the script `kind`, an optional
 *   design `task`, an optional `className` override, and an optional
 *   `namespace` wrapper.
 * @returns the destination `path` of the script inside a Unity project, the
 *   generated `content`, and the honesty and coverage `warnings`.
 * @throws Error when `kind` is not one of the supported script kinds.
 */
export function generateUnityScript(params: GenerateUnityScriptParams): UnityScriptResult {
  const className = resolveClassName(params.kind, params.className)
  const body = renderClassBody(params.kind, className)
  const namespace = resolveNamespace(params.namespace)
  const script =
    namespace === null
      ? ['using UnityEngine;', '', ...body.split('\n')]
      : ['', `namespace ${namespace}`, '{', '    using UnityEngine;', '', ...indentLines(body, 4).split('\n'), '}']
  const content = [...renderHeader(params.kind, className, params.task), ...script].join('\n') + '\n'
  return {
    path: `Assets/Scripts/${className}.cs`,
    content,
    warnings: buildWarnings(params.task, content),
  }
}

/**
 * Resolve the class name for one generation request.
 *
 * @param kind - script kind to look up.
 * @param override - caller class name; used verbatim when non-blank.
 * @returns the override when non-blank, otherwise the kind's default name.
 * @throws Error when `kind` is not one of the supported script kinds.
 */
function resolveClassName(kind: UnityScriptKind, override?: string): string {
  const fallback = DEFAULT_CLASS_NAMES[kind]
  if (fallback === undefined) {
    throw new Error(`unknown unity script kind: ${kind}`)
  }
  return override !== undefined && override.trim().length > 0 ? override : fallback
}

/**
 * Resolve the namespace wrapper for one generation request.
 *
 * @param override - caller namespace; used verbatim when non-blank.
 * @returns the override when non-blank, otherwise `null` for the global namespace.
 */
function resolveNamespace(override?: string): string | null {
  return override !== undefined && override.trim().length > 0 ? override : null
}

/**
 * Prefix every non-empty line of a block with spaces.
 *
 * @param text - block whose lines carry their own indentation.
 * @param spaces - number of spaces to add to each non-empty line.
 * @returns the indented block, with empty lines left empty.
 */
function indentLines(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n')
}

/**
 * Wrap one run of text into comment lines no longer than `width`.
 *
 * @param text - text to wrap; words are split on single spaces.
 * @param width - maximum characters per output line.
 * @returns the wrapped lines, each at most `width` characters except a line
 *   holding a single longer word.
 */
function wrapComment(text: string, width: number): readonly string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current === '' ? word : current + ' ' + word
    if (current === '' || candidate.length <= width) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current !== '') {
    lines.push(current)
  }
  return lines
}

/**
 * Flatten a value to one line so header interpolation stays line-oriented.
 *
 * @param value - value that may carry embedded newlines.
 * @returns the value with every LF and CRLF replaced by one space.
 */
function singleLine(value: string): string {
  return value.replace(/\r?\n/g, ' ')
}

/**
 * Render the file header comment lines for one generation request.
 *
 * @param kind - script kind being generated.
 * @param className - resolved class name of the script.
 * @param task - design task the script adapts, or `undefined` when absent.
 * @returns the header comment lines, each including the `//` prefix.
 */
function renderHeader(
  kind: UnityScriptKind,
  className: string,
  task: GameDesignTask | undefined,
): readonly string[] {
  const lines: string[] = [
    `// ${className}.cs — Unity MonoBehaviour skeleton generated by the DeepSeek`,
    '// Harness design-task toolchain.',
    '//',
    '// This file is a skeleton for an agent to review and adapt; it is not compiled',
    '// code. It has not been compiled, imported, or run in a Unity Editor, and no',
    '// build, import, or play-mode check has been executed against it.',
    '//',
    '// The Unity API surface below (MonoBehaviour, Transform, Rigidbody,',
    '// CharacterController, Input, Physics, GameObject, Debug, Coroutine) is assumed',
    "// from convention; verify every API against the target project's Unity",
    '// version before use.',
    '//',
    ...wrapComment(`Mirrors the harness ${KIND_MIRRORS[kind]}.`, 96).map((line) => `// ${line}`),
  ]
  if (task !== undefined) {
    lines.push(
      '//',
      `// Design task: ${singleLine(task.title)} (${task.id})`,
      `// Task description: ${singleLine(task.description)}`,
    )
  }
  lines.push(
    '//',
    `// Kind: ${kind}`,
    '// TODO: review every extension point marked TODO before this script is considered done.',
  )
  return lines
}

/**
 * Render the class body for one script kind.
 *
 * @param kind - script kind being generated.
 * @param className - resolved class name of the script.
 * @returns the class text at class-level indentation, without the file
 *   header, the using directives, or a namespace wrapper.
 * @throws Error when `kind` is not one of the supported script kinds.
 */
function renderClassBody(kind: UnityScriptKind, className: string): string {
  switch (kind) {
    case 'player-movement':
      return playerMovementBody(className)
    case 'enemy-ai':
      return enemyAiBody(className)
    case 'interaction':
      return interactionBody(className)
    case 'ui-controller':
      return uiControllerBody(className)
    case 'save-system':
      return saveSystemBody(className)
    default: {
      const unreachable: never = kind
      throw new Error(`unknown unity script kind: ${unreachable}`)
    }
  }
}

/**
 * Render the player movement class body.
 *
 * @param className - resolved class name of the script.
 * @returns the movement class text mirroring the harness movement model.
 */
function playerMovementBody(className: string): string {
  return `    /// <summary>
    /// Physics-driven player movement. Input is read in Update and applied to
    /// a Rigidbody in FixedUpdate. Extension points are marked TODO.
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        [Header("Movement configuration")]
        [SerializeField] private float baseSpeed = 5f;
        [SerializeField] private float sprintMultiplier = 1.5f;
        [SerializeField] private float crouchMultiplier = 0.5f;
        [SerializeField] private float jumpImpulse = 8f;
        [SerializeField] private float gravity = -25f;
        [SerializeField] private float groundFriction = 8f;
        [SerializeField] private float airControl = 0.3f;
        [SerializeField] private float maxGroundSpeed = 10f;
        [SerializeField] private float maxAirSpeed = 6f;

        [Header("Ground detection")]
        [SerializeField] private float groundRayLength = 0.1f;

        // State mirrors the harness MovementState fields: velocity, facing,
        // grounded, sprinting, crouching, speedMultiplier. Position lives on
        // Transform.
        private Vector3 velocity;
        private Vector3 facing = Vector3.forward;
        private bool grounded = true;
        private bool sprinting;
        private bool crouching;
        private float speedMultiplier = 1f;

        private MovementInput currentInput;
        private Rigidbody body;

        private void Awake()
        {
            body = GetComponent<Rigidbody>();
            if (body == null)
            {
                // TODO: add a Rigidbody on this GameObject, or switch the
                // movement model to a CharacterController.
                Debug.LogWarning("No Rigidbody found on " + name + "; movement is inert.");
            }
        }

        private void Update()
        {
            currentInput = ReadInput();
        }

        private void FixedUpdate()
        {
            ApplyMovement(currentInput, Time.fixedDeltaTime);
        }

        // Input mirrors the harness MovementInput fields: forward, strafe,
        // jumpPressed, sprint, crouch.
        private MovementInput ReadInput()
        {
            // TODO: replace the default axes with the target project's input
            // actions when it uses the Input System package.
            return new MovementInput
            {
                forward = Input.GetAxis("Vertical"),
                strafe = Input.GetAxis("Horizontal"),
                jumpPressed = Input.GetButtonDown("Jump"),
                sprint = Input.GetKey(KeyCode.LeftShift),
                crouch = Input.GetKey(KeyCode.LeftControl),
            };
        }

        private void ApplyMovement(MovementInput input, float deltaTime)
        {
            sprinting = input.sprint && !input.crouch;
            crouching = input.crouch;
            speedMultiplier = sprinting ? sprintMultiplier : crouching ? crouchMultiplier : 1f;
            float targetSpeed = Mathf.Min(baseSpeed * speedMultiplier, maxGroundSpeed);

            Vector3 move = transform.forward * input.forward + transform.right * input.strafe;
            if (move.sqrMagnitude > 1f)
            {
                move.Normalize();
            }

            if (move.sqrMagnitude > 0.001f)
            {
                facing = move.normalized;
                transform.rotation = Quaternion.LookRotation(facing);
            }

            if (body == null)
            {
                return;
            }

            Vector3 newVelocity = body.velocity;

            if (grounded && input.jumpPressed)
            {
                newVelocity.y = jumpImpulse;
                grounded = false;
            }

            newVelocity.y += gravity * deltaTime;

            if (grounded)
            {
                if (move.sqrMagnitude > 0.001f)
                {
                    newVelocity.x = move.x * targetSpeed;
                    newVelocity.z = move.z * targetSpeed;
                }
                else
                {
                    float friction = Mathf.Max(0f, 1f - groundFriction * deltaTime);
                    newVelocity.x *= friction;
                    newVelocity.z *= friction;
                }
            }
            else
            {
                // Air control: nudge the horizontal velocity toward the input.
                float steer = airControl * targetSpeed * deltaTime;
                newVelocity.x += move.x * steer;
                newVelocity.z += move.z * steer;
            }

            float maxSpeed = grounded ? maxGroundSpeed : maxAirSpeed;
            float horizontalSpeed = new Vector2(newVelocity.x, newVelocity.z).magnitude;
            if (horizontalSpeed > maxSpeed)
            {
                float scale = maxSpeed / horizontalSpeed;
                newVelocity.x *= scale;
                newVelocity.z *= scale;
            }

            // TODO: replace the single ground ray with the target project's
            // ground check (is-grounded query, sphere cast, layer mask).
            grounded = Physics.Raycast(transform.position, Vector3.down, groundRayLength);

            body.velocity = newVelocity;
        }

        /// <summary>Grounded flag of the movement state, for other scripts.</summary>
        public bool IsGrounded
        {
            get { return grounded; }
        }

        /// <summary>
        /// Per-frame input snapshot. Field names mirror the harness
        /// MovementInput model.
        /// </summary>
        private struct MovementInput
        {
            public float forward;
            public float strafe;
            public bool jumpPressed;
            public bool sprint;
            public bool crouch;
        }
    }`
}

/**
 * Render the enemy AI class body.
 *
 * @param className - resolved class name of the script.
 * @returns the AI class text mirroring the harness enemy-ai model.
 */
function enemyAiBody(className: string): string {
  return `    /// <summary>
    /// Enemy AI state machine driven by player proximity. States, ranges,
    /// speeds, and timing mirror the harness enemy-ai model. Extension points
    /// are marked TODO.
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        // Member names mirror the harness AIState values: Idle, Patrol,
        // Investigate, Chase, Attack, Retreat, Stun, Dead.
        public enum AiState
        {
            Idle,
            Patrol,
            Investigate,
            Chase,
            Attack,
            Retreat,
            Stun,
            Dead
        }

        [Header("Detection and combat ranges (units)")]
        [SerializeField] private float detectionRange = 10f;
        [SerializeField] private float attackRange = 2f;

        [Header("State speeds (units per second)")]
        [SerializeField] private float patrolSpeed = 2f;
        [SerializeField] private float chaseSpeed = 5f;
        [SerializeField] private float retreatSpeed = 4f;

        [Header("Attack and stun timing (seconds)")]
        [SerializeField] private float attackCooldown = 1.5f;
        [SerializeField] private float stunDuration = 2f;

        [Header("Targets")]
        [SerializeField] private Transform player;
        [SerializeField] private Vector3[] patrolWaypoints;

        // State mirrors the harness AIStateInstance fields: state, timeInState,
        // timeSinceLastAttack, stunned, hasTarget, targetPosition, patrolIndex.
        private AiState state = AiState.Idle;
        private float timeInState;
        private float timeSinceLastAttack;
        private bool stunned;
        private bool hasTarget;
        private Vector3 targetPosition;
        private int patrolIndex;

        private void Start()
        {
            timeSinceLastAttack = attackCooldown;
        }

        private void Update()
        {
            Tick(Time.deltaTime);
        }

        private void Tick(float deltaTime)
        {
            if (state == AiState.Dead)
            {
                return;
            }

            if (stunned)
            {
                timeInState += deltaTime;
                if (timeInState >= stunDuration)
                {
                    stunned = false;
                    SetState(AiState.Idle);
                }
                return;
            }

            timeInState += deltaTime;
            timeSinceLastAttack += deltaTime;

            float? distanceToPlayer = DistanceToPlayer();
            AiState next = EvaluateState(distanceToPlayer);
            if (next != state)
            {
                SetState(next);
            }

            switch (state)
            {
                case AiState.Patrol:
                    FollowPatrol();
                    break;
                case AiState.Chase:
                case AiState.Investigate:
                case AiState.Retreat:
                    MoveTowardTarget(deltaTime);
                    break;
                case AiState.Attack:
                    TryAttack();
                    break;
                case AiState.Idle:
                default:
                    // TODO: add idle behavior (scanning, returning to patrol).
                    break;
            }
        }

        private float? DistanceToPlayer()
        {
            if (player == null)
            {
                return null;
            }
            return Vector3.Distance(transform.position, player.position);
        }

        private AiState EvaluateState(float? distanceToPlayer)
        {
            if (distanceToPlayer != null)
            {
                if (distanceToPlayer.Value <= attackRange)
                {
                    return AiState.Attack;
                }
                if (distanceToPlayer.Value <= detectionRange)
                {
                    return AiState.Chase;
                }
            }

            // The lost-player timeout mirrors the harness transition minimum of
            // 3 seconds in Chase before returning to Patrol.
            if (state == AiState.Chase && timeInState > 3f)
            {
                return AiState.Patrol;
            }
            if (state == AiState.Attack && timeSinceLastAttack >= attackCooldown)
            {
                return AiState.Chase;
            }
            return state;
        }

        private void SetState(AiState next)
        {
            state = next;
            timeInState = 0f;
            hasTarget = false;
            targetPosition = Vector3.zero;
        }

        private void FollowPatrol()
        {
            if (patrolWaypoints == null || patrolWaypoints.Length == 0)
            {
                // TODO: assign patrol waypoints in the Unity Editor.
                return;
            }
            if (patrolIndex >= patrolWaypoints.Length)
            {
                patrolIndex = 0;
            }
            targetPosition = patrolWaypoints[patrolIndex];
            hasTarget = true;
            if (Vector3.Distance(transform.position, targetPosition) < 0.1f)
            {
                patrolIndex = (patrolIndex + 1) % patrolWaypoints.Length;
            }
        }

        private void MoveTowardTarget(float deltaTime)
        {
            float speed =
                state == AiState.Retreat ? retreatSpeed :
                state == AiState.Chase ? chaseSpeed :
                patrolSpeed;

            Vector3 direction;
            if (state == AiState.Retreat && player != null)
            {
                // TODO: retreat toward the project retreat point instead of
                // directly away from the player.
                direction = transform.position - player.position;
            }
            else
            {
                if (!hasTarget)
                {
                    if (player == null)
                    {
                        return;
                    }
                    targetPosition = player.position;
                    hasTarget = true;
                }
                direction = targetPosition - transform.position;
            }

            direction.y = 0f;
            if (direction.sqrMagnitude <= 0.0001f)
            {
                return;
            }
            transform.rotation = Quaternion.LookRotation(direction.normalized);
            transform.position += direction.normalized * speed * deltaTime;
        }

        private void TryAttack()
        {
            if (timeSinceLastAttack < attackCooldown)
            {
                return;
            }
            timeSinceLastAttack = 0f;
            // TODO: apply damage through the project damage interface and raise
            // the attack animation or event.
        }

        /// <summary>Current state of the AI state machine, for other scripts.</summary>
        public AiState State
        {
            get { return state; }
        }

        /// <summary>Stuns the enemy for stunDuration seconds.</summary>
        public void ApplyStun()
        {
            stunned = true;
            SetState(AiState.Stun);
        }

        /// <summary>Transitions to the terminal Dead state.</summary>
        public void Die()
        {
            stunned = false;
            SetState(AiState.Dead);
        }
    }`
}

/**
 * Render the interaction class body.
 *
 * @param className - resolved class name of the script.
 * @returns the interaction class text built on a trigger Collider.
 */
function interactionBody(className: string): string {
  return `    /// <summary>
    /// Proximity interaction: a trigger Collider reports tagged interactables
    /// and a key press fires on the current target. Extension points are
    /// marked TODO.
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        [SerializeField] private string interactableTag = "Interactable";
        [SerializeField] private KeyCode interactKey = KeyCode.E;

        private Collider currentTarget;

        private void Update()
        {
            if (Input.GetKeyDown(interactKey) && currentTarget != null)
            {
                // TODO: dispatch the interaction for currentTarget through the
                // project event system; the design tasks model this as action
                // event dispatch.
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag(interactableTag))
            {
                currentTarget = other;
                // TODO: show the interaction prompt in the HUD.
            }
        }

        private void OnTriggerExit(Collider other)
        {
            if (other == currentTarget)
            {
                currentTarget = null;
                // TODO: hide the interaction prompt in the HUD.
            }
        }
    }`
}

/**
 * Render the UI controller class body.
 *
 * @param className - resolved class name of the script.
 * @returns the UI class text built on toolkit-agnostic screen state.
 */
function uiControllerBody(className: string): string {
  return `    /// <summary>
    /// Screen-state controller for the HUD and screen flow. The state machine
    /// is toolkit-agnostic: bind each root GameObject to the project UI
    /// toolkit (uGUI or UI Toolkit) before use. Extension points are marked
    /// TODO.
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        public enum Screen
        {
            Hud,
            Pause,
            GameOver
        }

        [SerializeField] private GameObject hudRoot;
        [SerializeField] private GameObject pauseRoot;
        [SerializeField] private GameObject gameOverRoot;

        private Screen current = Screen.Hud;

        private void Start()
        {
            Show(Screen.Hud);
        }

        public void Show(Screen screen)
        {
            current = screen;
            // TODO: route each root to the project UI toolkit bindings.
            SetRootActive(hudRoot, screen == Screen.Hud);
            SetRootActive(pauseRoot, screen == Screen.Pause);
            SetRootActive(gameOverRoot, screen == Screen.GameOver);
        }

        /// <summary>Screen currently shown, for UI and other scripts.</summary>
        public Screen Current
        {
            get { return current; }
        }

        private void SetRootActive(GameObject root, bool active)
        {
            if (root != null)
            {
                root.SetActive(active);
            }
        }
    }`
}

/**
 * Render the save system class body.
 *
 * @param className - resolved class name of the script.
 * @returns the save class text built on an autosave Coroutine.
 */
function saveSystemBody(className: string): string {
  return `    /// <summary>
    /// Autosave loop built on a Coroutine so a long save spreads over frames
    /// and never blocks the game loop. Extension points are marked TODO.
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        [SerializeField] private float autosaveIntervalSeconds = 30f;

        private Coroutine autosaveRoutine;
        private bool saving;

        private void OnEnable()
        {
            if (autosaveRoutine != null)
            {
                StopCoroutine(autosaveRoutine);
            }
            autosaveRoutine = StartCoroutine(AutosaveLoop());
        }

        private void OnDisable()
        {
            if (autosaveRoutine != null)
            {
                StopCoroutine(autosaveRoutine);
                autosaveRoutine = null;
            }
        }

        private IEnumerator AutosaveLoop()
        {
            while (true)
            {
                yield return new WaitForSeconds(autosaveIntervalSeconds);
                yield return SaveAsync();
            }
        }

        /// <summary>Starts one save outside the autosave loop; ignored while a save runs.</summary>
        public void SaveNow()
        {
            if (!saving)
            {
                StartCoroutine(SaveAsync());
            }
        }

        private IEnumerator SaveAsync()
        {
            saving = true;
            SavePayload payload = GatherState();
            // TODO: serialize payload with the chosen backend (PlayerPrefs,
            // JSON file via System.IO, or a ScriptableObject) and spread large
            // writes over frames.
            yield return null;
            saving = false;
        }

        private SavePayload GatherState()
        {
            // TODO: collect the serializable game state from the project systems.
            return new SavePayload { Entries = 0 };
        }

        private struct SavePayload
        {
            public int Entries;
        }
    }`
}

/**
 * List the task's required engine APIs the generated file does not cover.
 *
 * An API counts as covered when every token of three or more characters in
 * its name appears in the generated content, case-insensitively; anything
 * else is uncovered.
 *
 * @param task - design task whose `requiredEngineApis` are checked.
 * @param content - generated script text to search.
 * @returns the uncovered API names, in the task's declaration order.
 */
function uncoveredEngineApis(task: GameDesignTask, content: string): readonly string[] {
  const haystack = content.toLowerCase()
  const uncovered: string[] = []
  for (const api of task.requiredEngineApis) {
    const tokens = api
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3)
    const covered = tokens.every((token) => haystack.includes(token))
    if (!covered) {
      uncovered.push(api)
    }
  }
  return uncovered
}

/**
 * Build the warning list for one generation request.
 *
 * @param task - design task the script adapts, or `undefined` when absent.
 * @param content - generated script text the coverage check runs against.
 * @returns the two honesty warnings, then one warning per uncovered
 *   required engine API.
 */
function buildWarnings(task: GameDesignTask | undefined, content: string): readonly string[] {
  const warnings: string[] = [SKELETON_WARNING, UNITY_VERSION_WARNING]
  if (task !== undefined) {
    for (const api of uncoveredEngineApis(task, content)) {
      warnings.push(
        `Design task '${task.title}' requires engine API '${api}' that is absent from the generated script; extend the skeleton to cover it.`,
      )
    }
  }
  return warnings
}
