import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  generateGodotScript,
  type GenerateGodotScriptParams,
  type GodotScriptKind,
} from '../src/godot-codegen.ts'
import type { GameDesignTask } from '../src/game-design-tasks.ts'

function makeTask(overrides: Partial<GameDesignTask> = {}): GameDesignTask {
  return {
    id: 'capability-implementation',
    title: 'Player capabilities',
    description: 'Implement the platformer capabilities: move, jump.',
    dependencies: ['input-setup'],
    affectedFiles: ['src/player/'],
    affectedAssets: [],
    requiredEngineApis: ['player controller', 'move_and_slide'],
    acceptanceCriteria: ["Capability 'move' responds to inputs: wasd"],
    testCases: ["Unit test: capability 'move' responds to wasd"],
    performanceNotes: ['Update capabilities once per game step'],
    completionState: 'not-started',
    ...overrides,
  }
}

const KINDS: readonly GodotScriptKind[] = [
  'player-character',
  'enemy-ai',
  'interaction',
  'ui-screen',
  'save-manager',
]

describe('generateGodotScript', () => {
  describe('per-kind skeletons', () => {
    it('player-character: Godot 4.x body, signals, and task-derived name', () => {
      const script = generateGodotScript({ task: makeTask(), kind: 'player-character' })
      expect(script.path).toBe('res://capability_implementation.gd')
      expect(script.content).toContain('extends CharacterBody2D')
      expect(script.content).toContain('signal state_changed')
      expect(script.content).toContain('func _physics_process(delta: float) -> void:')
      expect(script.content).toContain('func _ready() -> void:')
      expect(script.content).toContain('move_and_slide()')
      expect(script.content).toContain('Input.get_axis')
      expect(script.content).toContain('capability_implementation.gd')
      expect(script.content.length).toBeGreaterThan(0)
    })

    it('enemy-ai: state enum, ranges, and movement', () => {
      const script = generateGodotScript({ kind: 'enemy-ai' })
      expect(script.path).toBe('res://enemy_ai.gd')
      expect(script.content).toContain('extends CharacterBody2D')
      expect(script.content).toContain('enum AIState')
      expect(script.content).toContain('signal state_changed(new_state: AIState)')
      expect(script.content).toContain('detection_range')
      expect(script.content).toContain('attack_cooldown')
      expect(script.content).toContain('func _physics_process(delta: float) -> void:')
    })

    it('interaction: Area2D overlap and interact signal', () => {
      const script = generateGodotScript({ kind: 'interaction' })
      expect(script.path).toBe('res://interaction.gd')
      expect(script.content).toContain('extends Area2D')
      expect(script.content).toContain('signal interacted(interactor: Node)')
      expect(script.content).toContain('func interact(interactor: Node) -> void:')
      expect(script.content).toContain('get_overlapping_bodies')
    })

    it('ui-screen: CanvasLayer and close signal', () => {
      const script = generateGodotScript({ kind: 'ui-screen' })
      expect(script.path).toBe('res://ui_screen.gd')
      expect(script.content).toContain('extends CanvasLayer')
      expect(script.content).toContain('signal screen_closed(result: StringName)')
      expect(script.content).toContain('queue_free()')
    })

    it('save-manager: ResourceSaver and ResourceLoader persistence', () => {
      const script = generateGodotScript({ kind: 'save-manager' })
      expect(script.path).toBe('res://save_manager.gd')
      expect(script.content).toContain('ResourceSaver.save(save_data, SAVE_PATH)')
      expect(script.content).toContain('ResourceLoader.load(SAVE_PATH)')
      expect(script.content).toContain('signal save_completed(path: String)')
      expect(script.content).toContain('signal load_completed(data: Dictionary)')
      expect(script.content).toContain('user://savegame.save')
    })
  })

  describe('honesty warnings', () => {
    it('always states the skeleton is not run-verified and the API surface is assumed', () => {
      const script = generateGodotScript({ kind: 'ui-screen' })
      expect(script.warnings).toContain(
        'generated script is a skeleton for an agent to review and adapt; it is not imported, run, or compile-verified code',
      )
      expect(script.warnings).toContain(
        'the Godot API calls in this skeleton follow the Godot 4.x convention and must be verified against the target project Godot version before use',
      )
      expect(script.warnings.length).toBeGreaterThan(0)
    })

    it('warns naming each required engine API absent from the generated text', () => {
      const script = generateGodotScript({
        task: makeTask({ requiredEngineApis: ['move_and_slide', 'pathfinding service'] }),
        kind: 'player-character',
      })
      const missing = script.warnings.filter((warning) => warning.includes('pathfinding service'))
      expect(missing).toHaveLength(1)
      expect(script.warnings.some((warning) => warning.includes('move_and_slide'))).toBe(false)
    })

    it('covers every task required engine API or names it in the warnings', () => {
      const task = makeTask({ requiredEngineApis: ['move_and_slide', 'HUD renderer'] })
      for (const kind of KINDS) {
        const script = generateGodotScript({ task, kind })
        for (const api of task.requiredEngineApis) {
          const covered = script.content.toLowerCase().includes(api.toLowerCase())
          const warned = script.warnings.some((warning) => warning.includes(api))
          expect(covered || warned, `${kind} covers or warns about ${api}`).toBe(true)
        }
      }
    })

    it('warns when godotMajor is omitted that the 4.x branch was assumed', () => {
      const script = generateGodotScript({ kind: 'ui-screen' })
      expect(script.warnings).toContain(
        'godotMajor was not supplied; the Godot 4.x branch was generated by default — pass godotMajor: 3 for the Godot 3.x equivalents',
      )
    })

    it('warns when the script name is not a valid GDScript identifier', () => {
      const script = generateGodotScript({ kind: 'ui-screen', scriptName: 'pause menu!' })
      expect(script.path).toBe('res://pause menu!.gd')
      expect(script.warnings.some((warning) => warning.includes('pause menu!'))).toBe(true)
      expect(script.warnings.some((warning) => warning.includes('not a valid GDScript identifier'))).toBe(true)
    })
  })

  describe('Godot 3.x branch', () => {
    it('uses KinematicBody2D, export, move_and_slide(velocity), and emit_signal', () => {
      const script = generateGodotScript({ kind: 'player-character', godotMajor: 3 })
      expect(script.content).toContain('extends KinematicBody2D')
      expect(script.content).not.toContain('CharacterBody2D')
      expect(script.content).toContain('export var move_speed = 200.0')
      expect(script.content).toContain('move_and_slide(velocity)')
      expect(script.content).toContain('emit_signal("state_changed", "moving")')
      expect(script.content).not.toContain('.emit(')
    })

    it('documents the 3.x branch in the header and uses yield instead of await', () => {
      const script = generateGodotScript({ kind: 'player-character', godotMajor: 3 })
      expect(script.content).toContain('# Godot 3.x branch:')
      expect(script.content).toContain('KinematicBody2D movement bodies')
      const save3 = generateGodotScript({ kind: 'save-manager', godotMajor: 3 })
      expect(save3.content).toContain('yield(get_tree(), "idle_frame")')
      expect(save3.content).toContain('ResourceSaver.save(SAVE_PATH, save_data)')
      expect(save3.content).not.toContain('ResourceSaver.save(save_data, SAVE_PATH)')
    })

    it('names the 3.x API convention and drops the defaulted-major notice', () => {
      const script = generateGodotScript({ kind: 'player-character', godotMajor: 3 })
      expect(script.warnings).toContain(
        'the Godot API calls in this skeleton follow the Godot 3.x convention and must be verified against the target project Godot version before use',
      )
      expect(script.warnings.some((warning) => warning.includes('godotMajor was not supplied'))).toBe(false)
    })

    it('Godot 4.x explicit documents the branch and awaits process_frame in the save manager', () => {
      const script = generateGodotScript({ kind: 'player-character', godotMajor: 4 })
      expect(script.content).toContain('# Godot 4.x branch:')
      expect(script.content).toContain('CharacterBody2D movement bodies')
      const save4 = generateGodotScript({ kind: 'save-manager', godotMajor: 4 })
      expect(save4.content).toContain('await get_tree().process_frame')
      expect(save4.content).not.toContain('yield(')
    })
  })

  describe('script name resolution', () => {
    it('uses the scriptName override over the task-derived name', () => {
      const script = generateGodotScript({ task: makeTask(), kind: 'ui-screen', scriptName: 'pause_menu' })
      expect(script.path).toBe('res://pause_menu.gd')
      expect(script.content).toContain('# pause_menu.gd')
    })

    it('falls back to the kind default when no task or override is given', () => {
      expect(generateGodotScript({ kind: 'enemy-ai' }).path).toBe('res://enemy_ai.gd')
      expect(generateGodotScript({ kind: 'save-manager' }).path).toBe('res://save_manager.gd')
    })

    it('derives the name from the task id when no override is given', () => {
      const script = generateGodotScript({ task: makeTask({ id: 'ui-hud' }), kind: 'ui-screen' })
      expect(script.path).toBe('res://ui_hud.gd')
    })

    it('treats an empty scriptName as absent', () => {
      const script = generateGodotScript({ kind: 'interaction', scriptName: '' })
      expect(script.path).toBe('res://interaction.gd')
    })
  })

  describe('determinism and purity', () => {
    it('produces byte-identical output for identical input', () => {
      const params: GenerateGodotScriptParams = { task: makeTask(), kind: 'player-character', godotMajor: 4 }
      const first = generateGodotScript(params)
      const second = generateGodotScript(params)
      expect(second.content).toBe(first.content)
      expect(second.path).toBe(first.path)
      expect(second.warnings).toEqual(first.warnings)
      expect(second).toStrictEqual(first)
    })

    it('content ends with exactly one newline', () => {
      const script = generateGodotScript({ kind: 'ui-screen' })
      expect(script.content.endsWith('\n')).toBe(true)
      expect(script.content.endsWith('\n\n')).toBe(false)
    })

    it('generator source touches no filesystem, clock, or random source', () => {
      const source = readFileSync(fileURLToPath(new URL('../src/godot-codegen.ts', import.meta.url)), 'utf8')
      expect(source).not.toMatch(/\bDate\b/)
      expect(source).not.toMatch(/Math\.random/)
      expect(source).not.toMatch(/node:/)
      expect(source).not.toMatch(/\bprocess\b/)
      expect(source).not.toMatch(/readFile|writeFile|appendFile|existsSync/)
    })
  })

  describe('unknown kind', () => {
    it('throws an unknown script kind error', () => {
      const unknown = { kind: 'vehicle' } as GenerateGodotScriptParams
      expect(() => generateGodotScript(unknown)).toThrow(/unknown script kind: vehicle/)
    })
  })
})
