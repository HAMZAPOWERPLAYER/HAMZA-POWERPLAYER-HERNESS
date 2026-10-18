/**
 * Godot GDScript scaffold generator for gameplay implementation support.
 *
 * Generates GDScript script skeletons an agent can adapt when implementing a
 * game design task in a Godot project. The generator is pure string assembly
 * over in-memory input: no Godot editor exists in the harness, so generated
 * text is never imported, run, or compile-verified, and every result states
 * that limitation. Each script follows one documented Godot major-version
 * branch (4.x by default, 3.x on request) built from conservative, common
 * APIs, with extension points marked in the generated text. Task-required
 * engine APIs absent from the generated text are named in the warnings. All
 * helpers are deterministic, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/godot-codegen
 */

import { type GameDesignTask } from './game-design-tasks.ts'

/** Script kinds the scaffold generator produces. */
export type GodotScriptKind =
  | 'player-character'
  | 'enemy-ai'
  | 'interaction'
  | 'ui-screen'
  | 'save-manager'

/** Parameters for one scaffold generation run. */
export interface GenerateGodotScriptParams {
  /** Implementation task the scaffold adapts; its required engine APIs drive coverage warnings. */
  readonly task?: GameDesignTask
  /** Gameplay system the script scaffolds; an unrecognized runtime value fails with an unknown script kind error. */
  readonly kind: GodotScriptKind
  /** File stem for the generated script; overrides the task-derived and kind-default names. */
  readonly scriptName?: string
  /** Target Godot major version; 4 when omitted. */
  readonly godotMajor?: 3 | 4
}

/** One generated GDScript scaffold and the notices that accompany it. */
export interface GodotScript {
  /** Godot project path of the script, derived from the resolved script name. */
  readonly path: string
  /** Full GDScript source text; a skeleton for an agent to review and adapt, not verified code. */
  readonly content: string
  /** Honesty and coverage notices; never empty. */
  readonly warnings: readonly string[]
}

/**
 * Generate one GDScript scaffold for a gameplay implementation task.
 *
 * The result is a skeleton an agent can review and adapt, not code verified
 * to run: no Godot editor exists in the harness, so the generated text is
 * never imported, executed, or compile-checked, and the warnings always
 * state that limitation. The script body follows one Godot major-version
 * branch (4.x by default, 3.x on request) built from conservative, common
 * APIs, with extension points marked in the generated text. When a task is
 * supplied, every required engine API absent from the generated text is
 * named in the warnings. Output is deterministic: identical input produces
 * byte-identical content and warnings.
 *
 * @param params - generation parameters: script kind with optional task, script name override, and Godot major version.
 * @returns the script project path, full GDScript source text, and honesty and coverage warnings.
 * @throws Error when the kind is not one of the five supported script kinds.
 */
export function generateGodotScript(params: GenerateGodotScriptParams): GodotScript {
  if (!isScriptKind(params.kind)) {
    throw new Error(`unknown script kind: ${params.kind}`)
  }
  const major = params.godotMajor ?? 4
  const scriptName = resolveScriptName(params, params.kind)
  const content = renderScript(params, params.kind, scriptName, major)
  const warnings = collectWarnings(params, scriptName, major, content)
  return { path: `res://${scriptName}.gd`, content, warnings }
}

/** Human-readable name of each script kind, used in the generated header. */
const KIND_LABELS: Readonly<Record<GodotScriptKind, string>> = {
  'player-character': 'player character controller',
  'enemy-ai': 'enemy AI state machine',
  'interaction': 'interaction trigger',
  'ui-screen': 'UI screen',
  'save-manager': 'save data manager',
}

/** Default file stem per kind, used when no task or script name override is supplied. */
const KIND_DEFAULT_SCRIPT_NAMES: Readonly<Record<GodotScriptKind, string>> = {
  'player-character': 'player_character',
  'enemy-ai': 'enemy_ai',
  'interaction': 'interaction',
  'ui-screen': 'ui_screen',
  'save-manager': 'save_manager',
}

/** The supported script kinds, in declaration order. */
const SCRIPT_KINDS: readonly GodotScriptKind[] = [
  'player-character',
  'enemy-ai',
  'interaction',
  'ui-screen',
  'save-manager',
]

/** One GDScript identifier: a letter or underscore followed by letters, digits, or underscores. */
const GDSCRIPT_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Branch summary documented in the generated header, per Godot major version. */
const BRANCH_SUMMARIES: Readonly<Record<3 | 4, string>> = {
  3: 'KinematicBody2D movement bodies, move_and_slide(velocity), export properties, emit_signal calls, and yield where 4.x would await',
  4: 'CharacterBody2D movement bodies, velocity-driven move_and_slide(), @export properties, typed signals emitted with .emit(...), and await on SceneTree signals',
}

/** Always-present notice that the generated text is not run-verified. */
const SKELETON_WARNING =
  'generated script is a skeleton for an agent to review and adapt; it is not imported, run, or compile-verified code'

/** Notice used when the Godot major version was omitted and 4.x was assumed. */
const DEFAULTED_MAJOR_WARNING =
  'godotMajor was not supplied; the Godot 4.x branch was generated by default — pass godotMajor: 3 for the Godot 3.x equivalents'

/** Movement base class for the target major version; 4.x renamed KinematicBody2D to CharacterBody2D. */
function movementBaseClass(major: 3 | 4): string {
  return major === 3 ? 'KinematicBody2D' : 'CharacterBody2D'
}

/** Exported property declaration for the target major version; 4.x uses @export with a type annotation, 3.x uses export with type inference. */
function exportedVar(major: 3 | 4, name: string, type: string, value: string): string {
  return major === 3 ? `export var ${name} = ${value}` : `@export var ${name}: ${type} = ${value}`
}

/** move_and_slide call for the target major version; 4.x reads the velocity property, 3.x takes it as an argument. */
function moveAndSlide(major: 3 | 4): string {
  return major === 3 ? 'move_and_slide(velocity)' : 'move_and_slide()'
}

/** Signal emission statement for the target major version; 4.x emits on the signal, 3.x calls emit_signal. */
function emitSignal(major: 3 | 4, signal: string, argument: string): string {
  return major === 3 ? `emit_signal("${signal}", ${argument})` : `${signal}.emit(${argument})`
}

/** Input action literal for the target major version; 4.x uses StringName, 3.x uses String. */
function actionLiteral(major: 3 | 4, action: string): string {
  return major === 3 ? `"${action}"` : `&"${action}"`
}

/** Signal connection statement for the target major version; 4.x connects the Callable, 3.x connects signal and method strings. */
function connectSignal(major: 3 | 4, signal: string, method: string): string {
  return major === 3
    ? `connect("${signal}", self, "${method}")`
    : `${signal}.connect(${method})`
}

/** ResourceSaver.save call for the target major version; the resource and path argument order differs between 3.x and 4.x. */
function resourceSaverSave(major: 3 | 4, resource: string, path: string): string {
  return major === 3 ? `ResourceSaver.save(${path}, ${resource})` : `ResourceSaver.save(${resource}, ${path})`
}

/** Frame-yield note for the target major version; 4.x awaits a SceneTree signal, 3.x yields on the SceneTree. */
function frameYieldNote(major: 3 | 4): string {
  return major === 3
    ? '# TODO: to keep large saves off the frame, yield(get_tree(), "idle_frame") between chunks.'
    : '# TODO: to keep large saves off the frame, await get_tree().process_frame between chunks.'
}

/** Whether a runtime value names a supported script kind. */
function isScriptKind(value: string): value is GodotScriptKind {
  return (SCRIPT_KINDS as readonly string[]).includes(value)
}

/** Resolve the file stem: the override when set, else the task id in snake form, else the kind default. */
function resolveScriptName(params: GenerateGodotScriptParams, kind: GodotScriptKind): string {
  if (params.scriptName !== undefined && params.scriptName.length > 0) {
    return params.scriptName
  }
  const task = params.task
  if (task !== undefined) {
    const fromTask = task.id.replace(/[^A-Za-z0-9]+/g, '_')
    if (fromTask.length > 0) {
      return fromTask
    }
  }
  return KIND_DEFAULT_SCRIPT_NAMES[kind]
}

/** Assemble the full script text: header comment lines, a blank line, then the kind body. */
function renderScript(
  params: GenerateGodotScriptParams,
  kind: GodotScriptKind,
  scriptName: string,
  major: 3 | 4,
): string {
  const lines: string[] = [...headerLines(params, scriptName, major), '', ...bodyLines(kind, major)]
  return `${lines.join('\n')}\n`
}

/** Header comment lines naming the file, the honesty terms, the branch taken, and the task the scaffold adapts. */
function headerLines(params: GenerateGodotScriptParams, scriptName: string, major: 3 | 4): string[] {
  const lines = [
    `# ${scriptName}.gd — generated ${KIND_LABELS[params.kind]} skeleton for Godot ${major}.x`,
    '#',
    '# Skeleton for an agent to review and adapt, generated by the DeepSeek',
    '# Harness gameplay support tooling. It was not imported or run in a Godot',
    '# editor and is not verified to compile; every extension point is marked',
    '# in the generated text. The Godot API calls below follow the Godot',
    `# ${major}.x convention and must be verified against the target project`,
    '# Godot version before use.',
    '#',
    `# Godot ${major}.x branch: ${BRANCH_SUMMARIES[major]}`,
  ]
  const task = params.task
  if (task !== undefined) {
    lines.push(`# Task: ${task.title} (${task.id}).`)
  }
  return lines
}

/** Body lines for the selected kind, on the selected Godot major-version branch. */
function bodyLines(kind: GodotScriptKind, major: 3 | 4): string[] {
  switch (kind) {
    case 'player-character':
      return playerCharacterBody(major)
    case 'enemy-ai':
      return enemyAiBody(major)
    case 'interaction':
      return interactionBody(major)
    case 'ui-screen':
      return uiScreenBody(major)
    case 'save-manager':
      return saveManagerBody(major)
  }
}

/** Player character controller body; movement names mirror the harness player-movement model. */
function playerCharacterBody(major: 3 | 4): string[] {
  const stateSignal = major === 3
    ? 'signal state_changed(new_state)'
    : 'signal state_changed(new_state: StringName)'
  return [
    `extends ${movementBaseClass(major)}`,
    '',
    stateSignal,
    '',
    '## Movement configuration; the names mirror the harness player-movement model.',
    exportedVar(major, 'move_speed', 'float', '200.0'),
    exportedVar(major, 'sprint_multiplier', 'float', '1.5'),
    exportedVar(major, 'crouch_multiplier', 'float', '0.5'),
    exportedVar(major, 'jump_impulse', 'float', '400.0'),
    exportedVar(major, 'gravity', 'float', '900.0'),
    exportedVar(major, 'ground_friction', 'float', '8.0'),
    exportedVar(major, 'air_control', 'float', '0.3'),
    exportedVar(major, 'max_ground_speed', 'float', '200.0'),
    exportedVar(major, 'max_air_speed', 'float', '200.0'),
    '',
    'func _ready() -> void:',
    '\t# TODO: cache the sprite and animation player node references.',
    '\tpass',
    '',
    'func _physics_process(delta: float) -> void:',
    `\tvar input_vector := Vector2(Input.get_axis(${actionLiteral(major, 'move_left')}, ${actionLiteral(major, 'move_right')}), Input.get_axis(${actionLiteral(major, 'move_up')}, ${actionLiteral(major, 'move_down')}))`,
    '\tvar multiplier := 1.0',
    `\tif Input.is_action_pressed(${actionLiteral(major, 'sprint')}):`,
    '\t\tmultiplier = sprint_multiplier',
    `\telif Input.is_action_pressed(${actionLiteral(major, 'crouch')}):`,
    '\t\tmultiplier = crouch_multiplier',
    '\tvelocity.x = input_vector.x * move_speed * multiplier',
    '\tif is_on_floor():',
    `\t\tif Input.is_action_just_pressed(${actionLiteral(major, 'jump')}):`,
    '\t\t\tvelocity.y = -jump_impulse',
    '\t\tvelocity.x = move_toward(velocity.x, 0.0, ground_friction * move_speed * delta)',
    '\telse:',
    '\t\tvelocity.y += gravity * delta',
    '\t\tvelocity.x += input_vector.x * air_control * move_speed * delta',
    '\t\tif abs(velocity.x) > max_air_speed:',
    '\t\t\tvelocity.x *= max_air_speed / abs(velocity.x)',
    '\tif is_on_floor() and abs(velocity.x) > max_ground_speed:',
    '\t\tvelocity.x = sign(velocity.x) * max_ground_speed',
    `\t${moveAndSlide(major)}`,
    '\tif velocity.x != 0.0:',
    `\t\t${emitSignal(major, 'state_changed', actionLiteral(major, 'moving'))}`,
    '\telse:',
    `\t\t${emitSignal(major, 'state_changed', actionLiteral(major, 'idle'))}`,
  ]
}

/** Enemy AI state machine body; states and ranges mirror the harness enemy-ai model. */
function enemyAiBody(major: 3 | 4): string[] {
  return [
    `extends ${movementBaseClass(major)}`,
    '',
    'signal state_changed(new_state: AIState)',
    '',
    '## State machine states mirror the harness enemy-ai model.',
    'enum AIState { IDLE, PATROL, INVESTIGATE, CHASE, ATTACK, RETREAT, STUN, DEAD }',
    '',
    exportedVar(major, 'detection_range', 'float', '400.0'),
    exportedVar(major, 'attack_range', 'float', '40.0'),
    exportedVar(major, 'patrol_speed', 'float', '60.0'),
    exportedVar(major, 'chase_speed', 'float', '150.0'),
    exportedVar(major, 'retreat_speed', 'float', '120.0'),
    exportedVar(major, 'attack_cooldown', 'float', '1.5'),
    exportedVar(major, 'stun_duration', 'float', '2.0'),
    '',
    'var _state: AIState = AIState.IDLE',
    'var _time_in_state: float = 0.0',
    'var _time_since_last_attack: float = 0.0',
    'var _target_position: Vector2 = Vector2.ZERO',
    '',
    'func _ready() -> void:',
    '\t# TODO: locate the player node through a group or the scene tree.',
    '\tpass',
    '',
    'func _physics_process(delta: float) -> void:',
    '\t_time_in_state += delta',
    '\t_time_since_last_attack += delta',
    '\tvar player := _find_player()',
    '\tif player != null:',
    '\t\tvar distance := global_position.distance_to(player.global_position)',
    '\t\tif distance <= attack_range:',
    '\t\t\t_set_state(AIState.ATTACK)',
    '\t\telif distance <= detection_range:',
    '\t\t\t_set_state(AIState.CHASE)',
    '\t\t\t_target_position = player.global_position',
    '\t# TODO: on a landed hit, enter AIState.STUN for stun_duration seconds.',
    '\t# TODO: add investigate and retreat transitions keyed on _time_in_state.',
    '\tmatch _state:',
    '\t\tAIState.ATTACK:',
    '\t\t\tif _time_since_last_attack >= attack_cooldown:',
    '\t\t\t\t_time_since_last_attack = 0.0',
    '\t\t\t\t# TODO: apply damage to the player.',
    '\t\t\t_set_state(AIState.CHASE)',
    '\t\tAIState.CHASE:',
    '\t\t\tvelocity = (_target_position - global_position).normalized() * chase_speed',
    '\t\tAIState.RETREAT:',
    '\t\t\tvelocity = (global_position - _target_position).normalized() * retreat_speed',
    '\t\tAIState.PATROL:',
    '\t\t\t# TODO: move toward the next patrol waypoint.',
    '\t\t\tvelocity = velocity.move_toward(Vector2.ZERO, patrol_speed * delta)',
    '\t\t_:',
    '\t\t\tvelocity = velocity.move_toward(Vector2.ZERO, chase_speed * delta)',
    `\t${moveAndSlide(major)}`,
    '',
    'func _find_player() -> Node2D:',
    '\t# TODO: confirm the player group name matches the project.',
    '\tvar players := get_tree().get_nodes_in_group("players")',
    '\treturn players[0] as Node2D',
    '',
    'func _set_state(new_state: AIState) -> void:',
    '\tif _state == new_state:',
    '\t\treturn',
    '\t_state = new_state',
    '\t_time_in_state = 0.0',
    `\t${emitSignal(major, 'state_changed', 'new_state')}`,
  ]
}

/** Interaction trigger body; Area2D overlap plus an input action. */
function interactionBody(major: 3 | 4): string[] {
  return [
    'extends Area2D',
    '',
    'signal interacted(interactor: Node)',
    '',
    exportedVar(major, 'action_name', 'StringName', actionLiteral(major, 'interact')),
    exportedVar(major, 'interaction_enabled', 'bool', 'true'),
    '',
    'func _ready() -> void:',
    `\t${connectSignal(major, 'body_entered', '_on_body_entered')}`,
    `\t${connectSignal(major, 'body_exited', '_on_body_exited')}`,
    '',
    'func _unhandled_input(event: InputEvent) -> void:',
    '\tif not interaction_enabled:',
    '\t\treturn',
    '\tif event.is_action_pressed(action_name):',
    '\t\tfor body in get_overlapping_bodies():',
    '\t\t\tinteract(body)',
    '',
    'func interact(interactor: Node) -> void:',
    '\t# TODO: dispatch the interaction to the systems it affects.',
    `\t${emitSignal(major, 'interacted', 'interactor')}`,
    '',
    'func _on_body_entered(body: Node2D) -> void:',
    '\t# TODO: show an interaction prompt while a body overlaps.',
    '\tpass',
    '',
    'func _on_body_exited(body: Node2D) -> void:',
    '\t# TODO: hide the interaction prompt when the last body leaves.',
    '\tpass',
  ]
}

/** UI screen body; a CanvasLayer with a close signal. */
function uiScreenBody(major: 3 | 4): string[] {
  const closeResult = major === 3 ? '"closed"' : '&"closed"'
  return [
    'extends CanvasLayer',
    '',
    'signal screen_closed(result: StringName)',
    '',
    exportedVar(major, 'screen_title', 'String', '"Screen"'),
    exportedVar(major, 'close_on_escape', 'bool', 'true'),
    '',
    'func _ready() -> void:',
    "\t# TODO: build or fetch the screen's Control children here.",
    '\tpass',
    '',
    'func _unhandled_input(event: InputEvent) -> void:',
    `\tif close_on_escape and event.is_action_pressed(${actionLiteral(major, 'ui_cancel')}):`,
    '\t\tclose_screen()',
    '',
    'func close_screen() -> void:',
    '\t# TODO: run any close transition before the screen is freed.',
    `\t${emitSignal(major, 'screen_closed', closeResult)}`,
    '\tqueue_free()',
  ]
}

/** Save data manager body; Resource-based persistence through ResourceSaver and ResourceLoader. */
function saveManagerBody(major: 3 | 4): string[] {
  return [
    'extends Node',
    '',
    'signal save_completed(path: String)',
    'signal load_completed(data: Dictionary)',
    '',
    'const SAVE_PATH := "user://savegame.save"',
    '',
    'func _ready() -> void:',
    '\t# TODO: register this script as an autoload in project.godot.',
    '\tpass',
    '',
    'func save_game(data: Dictionary) -> void:',
    '\tvar save_data := SaveGameData.new()',
    '\tsave_data.data = data',
    `\tvar error := ${resourceSaverSave(major, 'save_data', 'SAVE_PATH')}`,
    '\tif error != OK:',
    '\t\t# TODO: report the save failure to the UI.',
    '\t\treturn',
    `\t${frameYieldNote(major)}`,
    `\t${emitSignal(major, 'save_completed', 'SAVE_PATH')}`,
    '',
    'func load_game() -> Dictionary:',
    '\tif not FileAccess.file_exists(SAVE_PATH):',
    '\t\treturn {}',
    '\tvar loaded = ResourceLoader.load(SAVE_PATH)',
    '\tif loaded is SaveGameData:',
    `\t\t${emitSignal(major, 'load_completed', 'loaded.data')}`,
    '\t\treturn loaded.data',
    '\treturn {}',
    '',
    'class SaveGameData extends Resource:',
    ...(major === 3 ? ['\texport var data = {}'] : ['\t@export var data: Dictionary = {}']),
  ]
}

/** Required engine APIs whose text does not appear in the generated content, compared case-insensitively. */
function missingRequiredApis(task: GameDesignTask, content: string): readonly string[] {
  const normalized = content.toLowerCase()
  const missing: string[] = []
  for (const api of task.requiredEngineApis) {
    if (!normalized.includes(api.toLowerCase())) {
      missing.push(api)
    }
  }
  return missing
}

/** Honesty and coverage notices for one generation run, in deterministic order. */
function collectWarnings(
  params: GenerateGodotScriptParams,
  scriptName: string,
  major: 3 | 4,
  content: string,
): string[] {
  const warnings: string[] = []
  warnings.push(SKELETON_WARNING)
  warnings.push(
    `the Godot API calls in this skeleton follow the Godot ${major}.x convention and must be verified against the target project Godot version before use`,
  )
  if (params.godotMajor === undefined) {
    warnings.push(DEFAULTED_MAJOR_WARNING)
  }
  const task = params.task
  if (task !== undefined) {
    for (const api of missingRequiredApis(task, content)) {
      warnings.push(
        `task '${task.id}' requires engine API '${api}', which is absent from the generated script; wire it in while adapting`,
      )
    }
  }
  if (!GDSCRIPT_IDENTIFIER.test(scriptName)) {
    warnings.push(
      `script name '${scriptName}' is not a valid GDScript identifier; rename the file stem before saving`,
    )
  }
  return warnings
}
