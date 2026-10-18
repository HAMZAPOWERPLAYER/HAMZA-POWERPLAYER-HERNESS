import { describe, expect, it } from 'vitest'
import {
  createGameDesignTaskPlan,
  deriveGameDesignTasks,
  type GameDesignTask,
} from '../src/game-design-tasks.ts'
import { createGameDesignSpec, estimateScope } from '../src/game-task-spec.ts'
import { transitionTaskCompletion } from '../src/task-planning-engine.ts'

type SpecParams = Parameters<typeof createGameDesignSpec>[0]

function buildParams(overrides: Partial<SpecParams> = {}): SpecParams {
  return {
    id: 'game-1',
    genre: 'platformer',
    platforms: ['windows'],
    capabilities: [],
    interactions: [],
    objectives: [],
    winConditions: [],
    failureConditions: [],
    progression: [],
    controls: { cameraType: 'fixed', controlScheme: 'keyboard', inputBindings: ['left', 'right'] },
    art: {
      style: 'pixel',
      palette: ['#111111', '#eeeeee'],
      lighting: 'flat',
      assetGuidance: '16-bit sprites',
    },
    audio: { music: 'chiptune', soundEffects: 'retro blips', spatialAudio: false },
    performance: {
      targetFps: null,
      targetResolution: null,
      minDeviceClass: null,
      memoryBudget: null,
    },
    accessibility: {
      colorBlind: false,
      subtitles: false,
      remappableControls: false,
      audioCues: false,
    },
    online: { onlineRequired: false, multiplayer: false, serverAuthoritative: false },
    ...overrides,
  }
}

function buildSpec(overrides: Partial<SpecParams> = {}) {
  return createGameDesignSpec(buildParams(overrides))
}

function buildRichSpec() {
  return buildSpec({
    capabilities: [
      { id: 'move', description: 'Move the character', inputs: ['wasd'], dependencies: ['physics'] },
      { id: 'jump', description: 'Jump', inputs: ['space'], dependencies: ['physics'] },
      { id: 'dash', description: 'Dash', inputs: ['shift'], dependencies: ['move'] },
      { id: 'grab', description: 'Grab ledges', inputs: ['w'], dependencies: ['move'] },
      { id: 'attack', description: 'Attack', inputs: ['mouse1'], dependencies: [] },
    ],
    interactions: [
      { id: 'jump-action', description: 'Jump action', trigger: 'space', affects: ['jump'] },
      { id: 'dash-action', description: 'Dash action', trigger: 'shift', affects: ['dash'] },
    ],
    objectives: [
      {
        id: 'reach-flag',
        description: 'Reach the flag',
        completionCondition: 'Touch the flag',
        required: true,
      },
      {
        id: 'collect-coins',
        description: 'Collect ten coins',
        completionCondition: 'Coins >= 10',
        required: false,
      },
    ],
    winConditions: [{ id: 'win-reach', description: 'Reach the flag', check: 'player touches flag' }],
    failureConditions: [
      {
        id: 'fail-fall',
        description: 'Fall off level',
        check: 'player y below kill plane',
        recovery: 'respawn at checkpoint',
      },
    ],
    progression: [
      {
        id: 'worlds',
        description: 'World progression',
        milestones: ['world 1'],
        unlockConditions: ['finish world 1'],
      },
    ],
    controls: {
      cameraType: 'follow',
      controlScheme: 'keyboard',
      inputBindings: ['left', 'right', 'jump'],
    },
    audio: { music: 'chiptune', soundEffects: 'retro blips', spatialAudio: true },
    performance: {
      targetFps: 60,
      targetResolution: '1920x1080',
      minDeviceClass: 'mid-range pc',
      memoryBudget: '1 GB',
    },
    accessibility: {
      colorBlind: true,
      subtitles: true,
      remappableControls: true,
      audioCues: true,
    },
    online: { onlineRequired: false, multiplayer: true, serverAuthoritative: true },
  })
}

function makeTask(overrides: Partial<GameDesignTask> = {}): GameDesignTask {
  return {
    id: 'extra-task',
    title: 'Extra task',
    description: 'Caller-supplied implementation task.',
    dependencies: [],
    affectedFiles: ['src/extra/'],
    affectedAssets: [],
    requiredEngineApis: ['extra api'],
    acceptanceCriteria: ['Extra criterion holds'],
    testCases: ['Unit test: extra behavior'],
    performanceNotes: ['Extra performance note'],
    completionState: 'not-started',
    ...overrides,
  }
}

const DESIGN_TASK_FIELDS = [
  'id',
  'title',
  'description',
  'dependencies',
  'affectedFiles',
  'affectedAssets',
  'requiredEngineApis',
  'acceptanceCriteria',
  'testCases',
  'performanceNotes',
  'completionState',
] as const

describe('deriveGameDesignTasks', () => {
  it('derives every system of a complete design in dependency order', () => {
    const tasks = deriveGameDesignTasks(buildRichSpec())
    expect(tasks.map((task) => task.id)).toEqual([
      'input-setup',
      'camera-controls',
      'capability-implementation',
      'interaction-wiring',
      'game-state-logic',
      'ui-hud',
      'progression-implementation',
      'online-networking',
      'asset-integration',
      'audio-playback',
      'accessibility-features',
      'performance-validation',
    ])
    const seen: string[] = []
    for (const task of tasks) {
      for (const dependency of task.dependencies) {
        expect(seen).toContain(dependency)
      }
      seen.push(task.id)
    }
    expect(tasks[tasks.length - 1]!.dependencies).toHaveLength(11)
  })

  it('produces every implementation-ready field on every task', () => {
    const tasks = deriveGameDesignTasks(buildRichSpec())
    for (const task of tasks) {
      for (const field of DESIGN_TASK_FIELDS) {
        expect(Object.hasOwn(task, field)).toBe(true)
      }
      expect(task.id.length).toBeGreaterThan(0)
      expect(task.title.length).toBeGreaterThan(0)
      expect(task.description.length).toBeGreaterThan(0)
      expect(Array.isArray(task.dependencies)).toBe(true)
      expect(task.affectedFiles.length).toBeGreaterThan(0)
      expect(task.affectedFiles.every((path) => typeof path === 'string')).toBe(true)
      expect(task.affectedAssets.every((path) => typeof path === 'string')).toBe(true)
      expect(task.requiredEngineApis.length).toBeGreaterThan(0)
      expect(task.acceptanceCriteria.length).toBeGreaterThan(0)
      expect(task.testCases.length).toBeGreaterThan(0)
      expect(task.performanceNotes.length).toBeGreaterThan(0)
      expect(task.completionState).toBe('not-started')
    }
  })

  it('carries spec content into descriptions, criteria, and engine APIs', () => {
    const tasks = deriveGameDesignTasks(buildRichSpec())
    const capability = tasks.find((task) => task.id === 'capability-implementation')!
    expect(capability.description).toBe(
      'Implement the platformer capabilities: move, jump, dash, grab, attack.',
    )
    expect(capability.acceptanceCriteria).toContain('Required systems are available: physics, move')
    const gameState = tasks.find((task) => task.id === 'game-state-logic')!
    expect(gameState.acceptanceCriteria).toContain("Win condition 'win-reach' checks: player touches flag")
    expect(gameState.acceptanceCriteria).toContain(
      "Failure condition 'fail-fall' checks: player y below kill plane",
    )
    const camera = tasks.find((task) => task.id === 'camera-controls')!
    expect(camera.requiredEngineApis).toEqual(['follow camera controller'])
    const performance = tasks.find((task) => task.id === 'performance-validation')!
    expect(performance.acceptanceCriteria).toContain(
      'Frame rate holds 60 fps in representative scenes',
    )
    expect(performance.acceptanceCriteria).toContain('Memory use stays within 1 GB')
    const accessibility = tasks.find((task) => task.id === 'accessibility-features')!
    expect(accessibility.description).toContain('color-blind support')
    expect(accessibility.requiredEngineApis).toContain('subtitle renderer')
    const interaction = tasks.find((task) => task.id === 'interaction-wiring')!
    expect(interaction.acceptanceCriteria).toContain("Interaction 'jump-action' affects 'jump'")
  })

  it('derives the baseline systems for an empty design', () => {
    const tasks = deriveGameDesignTasks(buildSpec())
    expect(tasks.map((task) => task.id)).toEqual([
      'input-setup',
      'camera-controls',
      'ui-hud',
      'asset-integration',
      'audio-playback',
      'performance-validation',
    ])
    const gamePerformance = tasks.find((task) => task.id === 'performance-validation')!
    expect(gamePerformance.acceptanceCriteria).toEqual([
      'Frame time stays within the platform budget',
    ])
  })

  it('omits online networking when scope estimation defers online multiplayer', () => {
    const spec = buildSpec({
      online: { onlineRequired: true, multiplayer: false, serverAuthoritative: false },
    })
    expect(estimateScope(spec).defer).toContain('online multiplayer')
    const ids = deriveGameDesignTasks(spec).map((task) => task.id)
    expect(ids).not.toContain('online-networking')
    expect(ids).toContain('ui-hud')
  })

  it('omits progression when scope estimation defers advanced progression systems', () => {
    const spec = buildSpec({
      progression: [
        { id: 'p1', description: 'P1', milestones: [], unlockConditions: [] },
        { id: 'p2', description: 'P2', milestones: [], unlockConditions: [] },
        { id: 'p3', description: 'P3', milestones: [], unlockConditions: [] },
      ],
    })
    expect(estimateScope(spec).defer).toContain('advanced progression systems')
    const ids = deriveGameDesignTasks(spec).map((task) => task.id)
    expect(ids).not.toContain('progression-implementation')
  })

  it('keeps the camera task when 3D camera polish is deferred', () => {
    const spec = buildSpec({
      controls: { cameraType: 'first-person', controlScheme: 'mouse', inputBindings: [] },
    })
    expect(estimateScope(spec).defer).toContain('3D camera polish')
    const ids = deriveGameDesignTasks(spec).map((task) => task.id)
    expect(ids).toContain('camera-controls')
  })

  it('leaves the spec unchanged and derives identical tasks', () => {
    const spec = buildRichSpec()
    const before = JSON.stringify(spec)
    const first = deriveGameDesignTasks(spec)
    const second = deriveGameDesignTasks(spec)
    expect(JSON.stringify(spec)).toBe(before)
    expect(second).toEqual(first)
  })
})

describe('createGameDesignTaskPlan', () => {
  it('builds a plan whose objective is the MVP description', () => {
    const spec = buildRichSpec()
    const plan = createGameDesignTaskPlan({ id: 'plan-1', spec })
    expect(plan.id).toBe('plan-1')
    expect(plan.objective).toBe(estimateScope(spec).mvp)
    expect(plan.tasks).toHaveLength(12)
    expect(plan.verified).toBe(false)
    expect(plan.completionCounts['not-started']).toBe(12)
    expect(plan.completionCounts['implemented']).toBe(0)
    expect(plan.readyTaskIds).toEqual(['input-setup', 'asset-integration', 'audio-playback'])
    expect(plan.blockedTaskIds).toHaveLength(9)
  })

  it('maps design task fields onto plan task fields', () => {
    const spec = buildRichSpec()
    const derived = deriveGameDesignTasks(spec).find(
      (task) => task.id === 'capability-implementation',
    )!
    const plan = createGameDesignTaskPlan({ id: 'plan-1', spec })
    const planned = plan.tasks.find((task) => task.id === 'capability-implementation')!
    expect(planned.description).toBe(`${derived.title}: ${derived.description}`)
    expect(planned.requirements).toEqual([])
    expect(planned.constraints).toEqual([...derived.performanceNotes])
    expect(planned.dependencies).toEqual([{ dependsOn: 'input-setup', requireVerified: false }])
    expect(planned.tools).toEqual([...derived.requiredEngineApis])
    expect(planned.acceptanceCriteria).toEqual([...derived.acceptanceCriteria])
    expect(planned.verificationCommands).toEqual([...derived.testCases])
    expect(planned.expectedOutputs).toEqual([...derived.affectedFiles, ...derived.affectedAssets])
    expect(planned.risks).toEqual([])
    expect(planned.state).toBe('queued')
    expect(planned.completionState).toBe('not-started')
  })

  it('applies caller completion states through the engine and recomputes readiness', () => {
    const spec = buildRichSpec()
    const legacy = makeTask({ id: 'legacy-system', completionState: 'implemented' })
    const plan = createGameDesignTaskPlan({
      id: 'plan-1',
      spec,
      additionalTasks: [legacy],
    })
    expect(plan.tasks).toHaveLength(13)
    expect(plan.completionCounts['implemented']).toBe(1)
    expect(plan.completionCounts['not-started']).toBe(12)
    const updated = transitionTaskCompletion(plan, 'input-setup', 'implemented')
    expect(updated.readyTaskIds).toContain('camera-controls')
    expect(updated.readyTaskIds).toContain('capability-implementation')
    expect(updated.completionCounts['implemented']).toBe(2)
    expect(updated.completionCounts['not-started']).toBe(11)
    expect(updated.verified).toBe(false)
  })

  it('throws when a task names an unknown dependency', () => {
    const spec = buildSpec()
    expect(() =>
      createGameDesignTaskPlan({
        id: 'plan-1',
        spec,
        additionalTasks: [makeTask({ id: 'orphan', dependencies: ['ghost'] })],
      }),
    ).toThrow('unknown dependency: ghost (task orphan)')
  })

  it('throws when two tasks share an id', () => {
    const spec = buildSpec()
    expect(() =>
      createGameDesignTaskPlan({
        id: 'plan-1',
        spec,
        additionalTasks: [makeTask({ id: 'input-setup' })],
      }),
    ).toThrow('duplicate task id: input-setup')
  })

  it('detects a dependency cycle and reports its path', () => {
    const spec = buildSpec()
    expect(() =>
      createGameDesignTaskPlan({
        id: 'plan-1',
        spec,
        additionalTasks: [
          makeTask({ id: 'cyc-a', dependencies: ['cyc-b'] }),
          makeTask({ id: 'cyc-b', dependencies: ['cyc-a'] }),
        ],
      }),
    ).toThrow('dependency cycle detected: cyc-a -> cyc-b -> cyc-a')
    expect(() =>
      createGameDesignTaskPlan({
        id: 'plan-1',
        spec,
        additionalTasks: [makeTask({ id: 'self', dependencies: ['self'] })],
      }),
    ).toThrow('dependency cycle detected: self -> self')
  })

  it('leaves the spec and caller tasks unchanged', () => {
    const spec = buildRichSpec()
    const legacy = makeTask({ id: 'legacy-system', completionState: 'implemented' })
    const specBefore = JSON.stringify(spec)
    const taskBefore = JSON.stringify(legacy)
    createGameDesignTaskPlan({ id: 'plan-1', spec, additionalTasks: [legacy] })
    expect(JSON.stringify(spec)).toBe(specBefore)
    expect(JSON.stringify(legacy)).toBe(taskBefore)
  })
})
