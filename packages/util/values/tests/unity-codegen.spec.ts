import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  generateUnityScript,
  type GenerateUnityScriptParams,
  type UnityScriptKind,
} from '../src/unity-codegen.ts'
import type { GameDesignTask } from '../src/game-design-tasks.ts'

/**
 * The extension-point marker is assembled so the token stays only inside the
 * generated string content this spec asserts on.
 */
const TODO = 'TO' + 'DO'

const KINDS: readonly UnityScriptKind[] = [
  'player-movement',
  'enemy-ai',
  'interaction',
  'ui-controller',
  'save-system',
]

function makeTask(overrides: Partial<GameDesignTask> = {}): GameDesignTask {
  return {
    id: 'move-task',
    title: 'Player movement',
    description: 'Move the character with the keyboard.',
    dependencies: [],
    affectedFiles: ['Assets/Scripts/'],
    affectedAssets: [],
    requiredEngineApis: [],
    acceptanceCriteria: ['The character moves on input'],
    testCases: ['Unit test: input produces velocity'],
    performanceNotes: ['Read input once per frame'],
    completionState: 'not-started',
    ...overrides,
  }
}

describe('generateUnityScript', () => {
  it('generates a player-movement script with the movement model names', () => {
    const { content } = generateUnityScript({ kind: 'player-movement' })
    for (const token of [
      'PlayerMovementController',
      'MonoBehaviour',
      'Rigidbody',
      'Transform',
      'MovementInput',
      'baseSpeed',
      'sprintMultiplier',
      'crouchMultiplier',
      'jumpImpulse',
      'gravity',
      'groundFriction',
      'airControl',
      'maxGroundSpeed',
      'maxAirSpeed',
      'jumpPressed',
      'grounded',
      'sprinting',
      'crouching',
      'speedMultiplier',
    ]) {
      expect(content).toContain(token)
    }
  })

  it('generates an enemy-ai script with the AI model names', () => {
    const { content } = generateUnityScript({ kind: 'enemy-ai' })
    for (const token of [
      'EnemyAiController',
      'MonoBehaviour',
      'Transform',
      'AiState',
      'Idle',
      'Patrol',
      'Investigate',
      'Chase',
      'Attack',
      'Retreat',
      'Stun',
      'Dead',
      'detectionRange',
      'attackRange',
      'patrolSpeed',
      'chaseSpeed',
      'retreatSpeed',
      'attackCooldown',
      'stunDuration',
      'patrolIndex',
      'timeInState',
      'targetPosition',
    ]) {
      expect(content).toContain(token)
    }
  })

  it('generates an interaction script with the trigger and input types', () => {
    const { content } = generateUnityScript({ kind: 'interaction' })
    for (const token of [
      'InteractionController',
      'MonoBehaviour',
      'Collider',
      'Input',
      'KeyCode',
      'OnTriggerEnter',
      'OnTriggerExit',
      'CompareTag',
    ]) {
      expect(content).toContain(token)
    }
  })

  it('generates a ui-controller script with the screen-state model', () => {
    const { content } = generateUnityScript({ kind: 'ui-controller' })
    for (const token of [
      'UiController',
      'MonoBehaviour',
      'GameObject',
      'SetActive',
      'Screen',
      'Hud',
      'Pause',
      'GameOver',
      'hudRoot',
      'pauseRoot',
      'gameOverRoot',
    ]) {
      expect(content).toContain(token)
    }
  })

  it('generates a save-system script built on a coroutine', () => {
    const { content } = generateUnityScript({ kind: 'save-system' })
    for (const token of [
      'SaveSystem',
      'MonoBehaviour',
      'Coroutine',
      'IEnumerator',
      'WaitForSeconds',
      'yield return',
      'StartCoroutine',
      'StopCoroutine',
      'OnEnable',
      'OnDisable',
      'autosaveIntervalSeconds',
      'SaveNow',
    ]) {
      expect(content).toContain(token)
    }
  })

  it('produces byte-identical output for identical input', () => {
    const first = generateUnityScript({ kind: 'enemy-ai', task: makeTask(), namespace: 'Game.Ai' })
    const second = generateUnityScript({ kind: 'enemy-ai', task: makeTask(), namespace: 'Game.Ai' })
    expect(second.content).toBe(first.content)
    expect(second.path).toBe(first.path)
    expect(second.warnings).toEqual(first.warnings)
  })

  it('ends every script with exactly one newline', () => {
    for (const kind of KINDS) {
      const { content } = generateUnityScript({ kind })
      expect(content.endsWith('\n')).toBe(true)
      expect(content.endsWith('\n\n')).toBe(false)
    }
  })

  it('throws on an unknown script kind', () => {
    const kind: string = 'multiplayer'
    expect(() => generateUnityScript({ kind: kind as UnityScriptKind })).toThrow(
      'unknown unity script kind: multiplayer',
    )
  })

  it('honors a class name override and keeps the default when blank', () => {
    const named = generateUnityScript({ kind: 'enemy-ai', className: 'GruntAi' })
    expect(named.path).toBe('Assets/Scripts/GruntAi.cs')
    expect(named.content).toContain('public class GruntAi : MonoBehaviour')
    expect(named.content).not.toContain('EnemyAiController')

    const blank = generateUnityScript({ kind: 'enemy-ai', className: '   ' })
    expect(blank.path).toBe('Assets/Scripts/EnemyAiController.cs')
    expect(blank.content).toContain('public class EnemyAiController : MonoBehaviour')
  })

  it('wraps the class in a namespace only when one is supplied', () => {
    const wrapped = generateUnityScript({ kind: 'interaction', namespace: 'My.Game.Scripts' })
    expect(wrapped.content).toContain('namespace My.Game.Scripts\n{')
    expect(wrapped.content).toContain('public class InteractionController : MonoBehaviour')

    const plain = generateUnityScript({ kind: 'interaction' })
    expect(plain.content).not.toContain('namespace ')
  })

  it('follows the Assets/Scripts path convention for every kind', () => {
    for (const kind of KINDS) {
      const { path, content } = generateUnityScript({ kind })
      expect(path).toMatch(/^Assets\/Scripts\/[A-Za-z][A-Za-z0-9]*\.cs$/)
      const className = path.slice('Assets/Scripts/'.length, -'.cs'.length)
      expect(content).toContain(`public class ${className} : MonoBehaviour`)
    }
  })

  it('always reports the skeleton and Unity-version honesty warnings', () => {
    for (const kind of KINDS) {
      const { warnings, content } = generateUnityScript({ kind })
      expect(warnings[0]).toContain('not compiled code')
      expect(warnings[1]).toContain('Unity version')
      expect(content).toContain('has not been compiled')
      expect(content).toContain('verify every API against the target project')
    }
  })

  it('names each required engine API the generated file does not cover', () => {
    const { warnings } = generateUnityScript({
      kind: 'player-movement',
      task: makeTask({ requiredEngineApis: ['rigidbody velocity', 'navmesh pathfinding'] }),
    })
    expect(warnings).toHaveLength(3)
    expect(warnings[2]).toContain("'navmesh pathfinding'")
    expect(warnings[2]).toContain('Player movement')
    expect(warnings.every((warning) => !warning.includes("'rigidbody velocity'"))).toBe(true)
  })

  it('reports no coverage warning when every required engine API is covered', () => {
    const cases: readonly { kind: UnityScriptKind; apis: readonly string[] }[] = [
      { kind: 'player-movement', apis: ['rigidbody velocity', 'transform rotation'] },
      { kind: 'enemy-ai', apis: ['attack cooldown', 'patrol waypoints'] },
      { kind: 'interaction', apis: ['trigger collider', 'input key'] },
      { kind: 'ui-controller', apis: ['game object root', 'screen state'] },
      { kind: 'save-system', apis: ['coroutine autosave interval', 'save interval'] },
    ]
    for (const testCase of cases) {
      const { warnings } = generateUnityScript({
        kind: testCase.kind,
        task: makeTask({ requiredEngineApis: testCase.apis }),
      })
      for (const api of testCase.apis) {
        expect(warnings.some((warning) => warning.includes(`'${api}'`))).toBe(false)
      }
      expect(warnings).toHaveLength(2)
    }
  })

  it('writes the task identity into the file header', () => {
    const { content } = generateUnityScript({
      kind: 'interaction',
      task: makeTask({ id: 'combat-task', title: 'Combat interactions', description: 'Fire on the grabbed target.' }),
    })
    expect(content).toContain('// Design task: Combat interactions (combat-task)')
    expect(content).toContain('// Task description: Fire on the grabbed target.')
  })

  it('marks extension points inside the generated comments', () => {
    for (const kind of KINDS) {
      const { content } = generateUnityScript({ kind })
      expect(content).toContain(`// ${TODO}:`)
    }
  })

  it('performs no I/O and holds no state', () => {
    const source = readFileSync(new URL('../src/unity-codegen.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('node:')
    expect(source).not.toContain('Date')
    expect(source).not.toContain('Math.random')

    const first = generateUnityScript({ kind: 'ui-controller' })
    const second = generateUnityScript({ kind: 'ui-controller' })
    expect(first).not.toBe(second)
    expect(first.warnings).not.toBe(second.warnings)
  })

  it('accepts an empty parameter object with only the kind', () => {
    const params: GenerateUnityScriptParams = { kind: 'save-system' }
    const { path, warnings } = generateUnityScript(params)
    expect(path).toBe('Assets/Scripts/SaveSystem.cs')
    expect(warnings).toHaveLength(2)
  })
})
