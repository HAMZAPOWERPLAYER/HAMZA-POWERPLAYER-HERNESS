import { describe, expect, it } from 'vitest'
import * as values from '../src/index.ts'
import {
  DEFAULT_UI_STATE,
  QUALITY_GATE_CHECKLIST,
  aggregateTestRuns,
  advanceAudio,
  analyzePerformance,
  analyzeSoftLocks,
  assignFileOwnership,
  assignTask,
  auditLifecycleBatch,
  auditScriptLifecycle,
  auditUnityReferences,
  buildGameProjectCapability,
  canCompleteMilestone,
  checkBudget,
  collectGuids,
  completeMilestone,
  coverageGateChecks,
  createAgentAssignment,
  createAudioState,
  createCompletionReport,
  createCoordinationState,
  createGameDesignSpec,
  createGameDesignTaskPlan,
  createUsage,
  deriveGameDesignTasks,
  detectGameEngine,
  detectProjectKind,
  detectProjectKinds,
  diagnosePerformance,
  estimateScope,
  evaluateCoverageGate,
  evaluateGameQualityGate,
  formatChangeSummary,
  formatFlutterPubspec,
  formatGodotSceneSummary,
  hideScreen,
  isCompletionVerified,
  isIgnored,
  parseGodotScene,
  parseIgnoreRules,
  parsePubspec,
  recordUsage,
  requestPlayback,
  reviewIntegration,
  runSecurityAudit,
  securityAuditChecks,
  showScreen,
  stopByCategory,
  stopPlayback,
  summarizeChanges,
  validateAudioCatalog,
  validateGodotSceneIntegrity,
  validateUiGameSync,
  type BudgetLimits,
  type FileChange,
  type GameDesignTask,
  type PerformanceSample,
  type QualityCategoryInput,
  type ScriptLanguage,
  type TestRun,
  type UIState,
} from '../src/index.ts'

const TASK_ID = 'release-verify-1'
const FIXED_TIME = 1_750_000_000_000

const PUBSPEC = [
  'name: flutter_game',
  'description: A Flutter game project',
  'environment:',
  "  sdk: '>=3.0.0 <4.0.0'",
  'dependencies:',
  '  flutter:',
  '    sdk: flutter',
  '  provider: ^6.0.0',
  '  flame: ^1.10.0',
  'dev_dependencies:',
  '  flutter_test:',
  '    sdk: flutter',
  '  mocktail: ^1.0.0',
].join('\n')

const MARKERS = ['pubspec.yaml', 'package.json', 'android/app/src/main/AndroidManifest.xml']

const IGNORE_TEXT = [
  '# Flutter and Android build outputs',
  'build/',
  '.dart_tool/',
  '!build/keep.txt',
].join('\n')

const ALL_CHANGES: readonly FileChange[] = [
  { path: 'lib/main.dart', kind: 'added' },
  { path: 'lib/game_engine.dart', kind: 'modified' },
  { path: 'build/app/outputs/flutter-apk/app-release.apk', kind: 'added' },
  { path: '.dart_tool/flutter_build.json', kind: 'modified' },
  { path: 'pubspec.yaml', kind: 'modified' },
  { path: 'test/game_test.dart', kind: 'added' },
]

const SOURCE_FILES = ['lib/main.dart', 'lib/game_engine.dart', 'pubspec.yaml', 'test/game_test.dart']

const RUNS: readonly TestRun[] = [
  { name: 'flutter unit tests', outcomes: ['passed', 'passed', 'passed', 'passed', 'passed'] },
  { name: 'flutter unit tests', outcomes: ['passed', 'failed', 'passed', 'passed', 'passed'] },
  { name: 'flutter widget tests', outcomes: ['passed', 'passed', 'passed'] },
]

const GREEN_RUNS: readonly TestRun[] = [
  { name: 'flutter unit tests', outcomes: ['passed', 'passed', 'passed'] },
  { name: 'flutter widget tests', outcomes: ['passed', 'passed', 'passed', 'passed'] },
]

describe('pubspec reads the Flutter project metadata', () => {
  it('reads name, description, sdk constraint, dependency count, and the Flutter SDK flag', () => {
    const pubspec = parsePubspec(PUBSPEC)
    expect(pubspec.name).toBe('flutter_game')
    expect(pubspec.description).toBe('A Flutter game project')
    expect(pubspec.sdkConstraint).toBe('>=3.0.0 <4.0.0')
    expect(pubspec.dependencyCount).toBe(2)
    expect(pubspec.hasFlutterSdkDependency).toBe(true)
  })

  it('returns sorted, de-duplicated dependency lists the pubspec summary can render', () => {
    const pubspec = parsePubspec(PUBSPEC)
    expect(pubspec.dependencies).toEqual(['flame', 'provider'])
    expect(pubspec.devDependencies).toEqual(['flutter_test', 'mocktail'])
    expect(formatFlutterPubspec(pubspec)).toMatch('name=flutter_game')
    expect(formatFlutterPubspec(pubspec)).toMatch('flutterSdk=yes')
    expect(formatFlutterPubspec(pubspec)).toMatch('deps=2')
  })
})

describe('project-kind confirms Flutter plus Node', () => {
  it('detects Flutter and Node (and Android) from the observed markers', () => {
    const kinds = detectProjectKinds(MARKERS)
    expect(kinds).toEqual(['flutter', 'android', 'node'])
    expect(detectProjectKind(MARKERS)).toBe('flutter')
    expect(kinds).toContain('flutter')
    expect(kinds).toContain('node')
  })
})

describe('ignore rules filter build outputs before changes are summarized', () => {
  it('parses the ignore rules for build output directories', () => {
    const rules = parseIgnoreRules(IGNORE_TEXT.split('\n'))
    expect(rules).toHaveLength(3)
    expect(rules[0]).toEqual({ pattern: 'build', negated: false, directoryOnly: true })
    expect(rules[2]).toEqual({ pattern: 'build/keep.txt', negated: true, directoryOnly: false })
  })

  it('ignores build output paths but keeps source and test paths', () => {
    const rules = parseIgnoreRules(IGNORE_TEXT.split('\n'))
    expect(isIgnored(rules, 'build/app/outputs/flutter-apk/app-release.apk', false)).toBe(true)
    expect(isIgnored(rules, '.dart_tool/flutter_build.json', false)).toBe(true)
    expect(isIgnored(rules, 'lib/main.dart', false)).toBe(false)
    expect(isIgnored(rules, 'pubspec.yaml', false)).toBe(false)
    expect(isIgnored(rules, 'test/game_test.dart', false)).toBe(false)
  })

  it('lets a negated rule re-include a path inside an ignored directory', () => {
    const rules = parseIgnoreRules(IGNORE_TEXT.split('\n'))
    expect(isIgnored(rules, 'build/keep.txt', false)).toBe(false)
  })

  it('summarizes only the source changes after build outputs are filtered out', () => {
    const rules = parseIgnoreRules(IGNORE_TEXT.split('\n'))
    const sourceChanges = ALL_CHANGES.filter(change => !isIgnored(rules, change.path, false))
    const summary = summarizeChanges(sourceChanges)
    expect(summary.added).toEqual(['lib/main.dart', 'test/game_test.dart'])
    expect(summary.modified).toEqual(['lib/game_engine.dart', 'pubspec.yaml'])
    expect(summary.removed).toEqual([])
    expect(summary.renamed).toEqual([])
    expect(summary.total).toBe(4)
  })
})

describe('change summary reports what changed', () => {
  it('groups added, modified, removed, and renamed changes with a correct total', () => {
    const summary = summarizeChanges([
      { path: 'lib/a.dart', kind: 'added' },
      { path: 'lib/b.dart', kind: 'modified' },
      { path: 'lib/c.dart', kind: 'removed' },
      { path: 'lib/d.dart', kind: 'renamed', previousPath: 'lib/old.dart' },
    ])
    expect(summary.added).toEqual(['lib/a.dart'])
    expect(summary.modified).toEqual(['lib/b.dart'])
    expect(summary.removed).toEqual(['lib/c.dart'])
    expect(summary.renamed).toEqual([{ from: 'lib/old.dart', to: 'lib/d.dart' }])
    expect(summary.total).toBe(4)
  })

  it('renders the filtered summary in the fixed added, modified, removed, renamed order', () => {
    const rules = parseIgnoreRules(IGNORE_TEXT.split('\n'))
    const sourceChanges = ALL_CHANGES.filter(change => !isIgnored(rules, change.path, false))
    const summary = summarizeChanges(sourceChanges)
    expect(formatChangeSummary(summary)).toBe(
      'added: lib/main.dart, test/game_test.dart\nmodified: lib/game_engine.dart, pubspec.yaml',
    )
  })
})

describe('test aggregation reports CI health', () => {
  it('sums outcomes across runs and counts the flaky run', () => {
    const report = aggregateTestRuns(RUNS, 2)
    expect(report.runs).toBe(3)
    expect(report.totalTests).toBe(13)
    expect(report.passed).toBe(12)
    expect(report.failed).toBe(1)
    expect(report.skipped).toBe(0)
    expect(report.flakyRuns).toBe(1)
    expect(report.flakiness).toBe(0.2)
  })

  it('reports the suite unhealthy when any run failed', () => {
    const report = aggregateTestRuns(RUNS, 2)
    expect(report.healthy).toBe(false)
  })

  it('reports the suite healthy when every run passed with no flaky runs', () => {
    const report = aggregateTestRuns(GREEN_RUNS, 2)
    expect(report.runs).toBe(2)
    expect(report.totalTests).toBe(7)
    expect(report.passed).toBe(7)
    expect(report.failed).toBe(0)
    expect(report.flakyRuns).toBe(0)
    expect(report.flakiness).toBe(0)
    expect(report.healthy).toBe(true)
  })
})

describe('budget guard enforces the token budget across verification', () => {
  it('starts at zero usage and allows usage within every limit', () => {
    const limits: BudgetLimits = { maxTokens: 10_000, maxRequests: 20, maxCostUsd: 1.00 }
    const usage = createUsage()
    expect(usage).toEqual({ tokens: 0, requests: 0, costUsd: 0 })
    const status = checkBudget(limits, usage)
    expect(status.allowed).toBe(true)
    expect(status.exhausted).toEqual([])
  })

  it('accumulates usage across verification steps and exhausts tokens exactly at the boundary', () => {
    const limits: BudgetLimits = { maxTokens: 10_000, maxRequests: 20, maxCostUsd: 1.00 }
    const afterFirst = recordUsage(createUsage(), { tokens: 3_000, requests: 5, costUsd: 0.30 })
    expect(checkBudget(limits, afterFirst).allowed).toBe(true)
    const afterSecond = recordUsage(afterFirst, { tokens: 7_000, requests: 10, costUsd: 0.45 })
    expect(afterSecond).toEqual({ tokens: 10_000, requests: 15, costUsd: 0.75 })
    const status = checkBudget(limits, afterSecond)
    expect(status.allowed).toBe(false)
    expect(status.exhausted).toEqual(['tokens'])
  })

  it('rejects a negative token delta and leaves usage untouched', () => {
    const usage = createUsage()
    expect(() => recordUsage(usage, { tokens: -100 })).toThrow(
      'budget delta tokens must be non-negative: -100',
    )
    expect(usage).toEqual({ tokens: 0, requests: 0, costUsd: 0 })
  })
})

describe('completion report reaches the final release verdict', () => {
  it('assembles a report from the change summary, test runs, and verification facts', () => {
    const report = createCompletionReport({
      taskId: TASK_ID,
      filesModified: SOURCE_FILES,
      featuresImplemented: ['flutter game engine', 'hot reload support'],
      testsExecuted: ['flutter unit tests', 'flutter widget tests'],
      commandsExecuted: ['flutter test', 'flutter build apk'],
      verificationOutcomes: [
        { command: 'flutter test', exitStatus: 0, summary: 'all green' },
        { command: 'flutter build apk', exitStatus: 0, summary: 'apk built' },
      ],
      buildStatus: 'passed',
      knownLimitations: ['web target not yet verified'],
      remainingWork: [],
      timestamp: FIXED_TIME,
    })
    expect(report.taskId).toBe(TASK_ID)
    expect(report.filesModified).toEqual(SOURCE_FILES)
    expect(report.featuresImplemented).toEqual(['flutter game engine', 'hot reload support'])
    expect(report.buildStatus).toBe('passed')
    expect(report.timestamp).toBe(FIXED_TIME)
  })

  it('verifies completion when the build passed, every verification command exited zero, and no work remains', () => {
    const report = createCompletionReport({
      taskId: TASK_ID,
      filesModified: SOURCE_FILES,
      verificationOutcomes: [
        { command: 'flutter test', exitStatus: 0 },
        { command: 'flutter build apk', exitStatus: 0 },
      ],
      buildStatus: 'passed',
      remainingWork: [],
      timestamp: FIXED_TIME,
    })
    expect(isCompletionVerified(report)).toBe(true)
  })

  it('fails verification when remaining work exists even though the build passed', () => {
    const report = createCompletionReport({
      taskId: TASK_ID,
      buildStatus: 'passed',
      verificationOutcomes: [{ command: 'flutter test', exitStatus: 0 }],
      remainingWork: ['fix the flaky widget test'],
      timestamp: FIXED_TIME,
    })
    expect(isCompletionVerified(report)).toBe(false)
  })

  it('fails verification when the build failed even though verification commands exited zero', () => {
    const report = createCompletionReport({
      taskId: TASK_ID,
      buildStatus: 'failed',
      verificationOutcomes: [{ command: 'flutter test', exitStatus: 0 }],
      remainingWork: [],
      timestamp: FIXED_TIME,
    })
    expect(isCompletionVerified(report)).toBe(false)
  })
})

const DESIGN_SPEC = createGameDesignSpec({
  id: 'hero-quest',
  genre: 'adventure',
  platforms: ['windows'],
  capabilities: [
    { id: 'walk', description: 'Walk between rooms', inputs: ['wasd'], dependencies: [] },
  ],
  interactions: [],
  objectives: [
    {
      id: 'find-treasure',
      description: 'Find the treasure',
      completionCondition: 'Player holds the treasure',
      required: true,
    },
  ],
  winConditions: [
    { id: 'hold-treasure', description: 'Hold the treasure', check: 'inventory contains treasure' },
  ],
  failureConditions: [],
  progression: [],
  controls: {
    cameraType: 'follow',
    controlScheme: 'keyboard',
    inputBindings: ['left', 'right', 'interact'],
  },
  art: {
    style: 'hand-painted',
    palette: ['#204060', '#f0e6d2'],
    lighting: 'warm',
    assetGuidance: 'soft-edged props',
  },
  audio: { music: 'ambient drone', soundEffects: 'footsteps and UI blips', spatialAudio: true },
  performance: {
    targetFps: 60,
    targetResolution: '1920x1080',
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
})

describe('design spec becomes a dependency-ordered implementation plan', () => {
  it('derives one task per MVP system and orders them before performance validation', () => {
    const scope = estimateScope(DESIGN_SPEC)
    expect(scope.complexity).toBe('small')
    expect(scope.defer).toEqual([])

    const tasks = deriveGameDesignTasks(DESIGN_SPEC)
    expect(tasks.map(task => task.id)).toEqual([
      'input-setup',
      'camera-controls',
      'capability-implementation',
      'game-state-logic',
      'ui-hud',
      'asset-integration',
      'audio-playback',
      'performance-validation',
    ])
    expect(tasks.every(task => task.completionState === 'not-started')).toBe(true)
  })

  it('builds a plan whose objective is the scope MVP and whose validation task depends on every earlier task', () => {
    const scope = estimateScope(DESIGN_SPEC)
    const derived = deriveGameDesignTasks(DESIGN_SPEC)
    const localizationTask: GameDesignTask = {
      id: 'localization',
      title: 'Localization',
      description: 'Load UI strings from a string table.',
      dependencies: ['ui-hud'],
      affectedFiles: ['src/i18n/'],
      affectedAssets: [],
      requiredEngineApis: ['string table'],
      acceptanceCriteria: ['UI strings resolve through the string table'],
      testCases: ['Unit test: a missing key falls back to its default text'],
      performanceNotes: ['Load string tables without blocking the first frame'],
      completionState: 'verified',
    }
    const plan = createGameDesignTaskPlan({
      id: 'hero-quest-plan',
      spec: DESIGN_SPEC,
      additionalTasks: [localizationTask],
    })

    expect(plan.objective).toBe(scope.mvp)
    expect(plan.tasks).toHaveLength(derived.length + 1)

    const validation = plan.tasks.find(task => task.id === 'performance-validation')
    expect(validation?.dependencies.map(dependency => dependency.dependsOn)).toEqual(
      derived.slice(0, -1).map(task => task.id),
    )

    const audioTask = plan.tasks.find(task => task.id === 'audio-playback')
    expect(audioTask?.tools).toContain('spatial audio emitter')
    expect(audioTask?.expectedOutputs).toContain('assets/audio/')

    const localized = plan.tasks.find(task => task.id === 'localization')
    expect(localized?.completionState).toBe('verified')
    expect(plan.completionCounts['verified']).toBe(1)
    expect(plan.completionCounts['not-started']).toBe(derived.length)
    expect(plan.verified).toBe(false)
  })
})

describe('audio catalog carries the design task into playback decisions', () => {
  it('validates the catalog and drives one full playback session with cooldowns, expiry, and mute', () => {
    const audioTask = deriveGameDesignTasks(DESIGN_SPEC).find(task => task.id === 'audio-playback')
    expect(audioTask?.affectedAssets).toContain('assets/audio/')
    expect(audioTask?.performanceNotes).toContain('Cap concurrent spatial emitters per frame')

    const catalog = [
      { id: 'ambient-loop', category: 'music', looping: true, spatial: true },
      {
        id: 'footstep',
        category: 'sfx',
        looping: false,
        spatial: false,
        cooldownSeconds: 0.5,
        durationSeconds: 0.4,
      },
    ]
    const categories = {
      music: { volume: 0.8, muted: false },
      sfx: { volume: 1, muted: false },
    }
    expect(validateAudioCatalog(catalog, categories)).toEqual([])

    const ambient = requestPlayback(createAudioState(), catalog, categories, 'ambient-loop', 0)
    expect(ambient.played).toBe(true)
    expect(ambient.reason).toBeNull()
    expect(ambient.state.voices[0]?.remainingSeconds).toBeNull()

    const repeat = requestPlayback(ambient.state, catalog, categories, 'ambient-loop', 1)
    expect(repeat.played).toBe(false)
    expect(repeat.reason).toBe("event 'ambient-loop' is already playing")
    expect(repeat.state).toBe(ambient.state)

    const step = requestPlayback(repeat.state, catalog, categories, 'footstep', 1)
    expect(step.played).toBe(true)
    expect(step.state.voices[1]?.remainingSeconds).toBe(0.4)

    const afterCategoryStop = stopByCategory(step.state, 'sfx')
    expect(afterCategoryStop.voices).toEqual(ambient.state.voices)

    const onCooldown = requestPlayback(afterCategoryStop, catalog, categories, 'footstep', 1.2)
    expect(onCooldown.played).toBe(false)
    expect(onCooldown.reason).toBe("event 'footstep' is on cooldown")

    const cooledDown = requestPlayback(afterCategoryStop, catalog, categories, 'footstep', 1.6)
    expect(cooledDown.played).toBe(true)
    expect(cooledDown.state.voices[1]?.remainingSeconds).toBe(0.4)

    const advanced = advanceAudio(cooledDown.state, 0.5)
    expect(advanced.voices).toHaveLength(1)
    expect(advanced.voices[0]?.eventId).toBe('ambient-loop')

    const mutedCategories = { ...categories, music: { volume: 0.8, muted: true } }
    const silent = stopPlayback(advanced, 'ambient-loop')
    expect(silent.voices).toEqual([])
    const muted = requestPlayback(silent, catalog, mutedCategories, 'ambient-loop', 2)
    expect(muted.played).toBe(false)
    expect(muted.reason).toBe("category 'music' is muted")
  })
})

describe('lifecycle audit covers the implementation scripts of the derived audio task', () => {
  const csharpSource = [
    'public class AudioPlayback : MonoBehaviour {',
    '    void OnEnable() {',
    '        EventBus.Footstep += HandleFootstep;',
    '    }',
    '    void OnDisable() {',
    '        EventBus.Footstep -= HandleFootstep;',
    '    }',
    '    void HandleFootstep() {',
    '        Debug.Log("step");',
    '    }',
    '    void Pump() {',
    '        while (running) {',
    '            Music.Changed += HandleFootstep;',
    '        }',
    '    }',
    '}',
  ].join('\n')

  const gdscriptSource = [
    'func _ready():',
    '    timer.connect("timeout", _on_timeout)',
    '    timer.disconnect("timeout", _on_timeout)',
    '    for i in 3:',
    '        music.connect("beat", _on_beat)',
  ].join('\n')

  it('pairs the teardown subscription and reports the loop-scoped repeat hazard in both scripts', () => {
    const audioTask = deriveGameDesignTasks(DESIGN_SPEC).find(task => task.id === 'audio-playback')
    const csharpFile = `${audioTask?.affectedFiles[0] ?? ''}AudioPlayback.cs`
    const gdscriptFile = 'src/audio/AudioHooks.gd'
    expect(csharpFile).toBe('src/audio/AudioPlayback.cs')

    const single = auditScriptLifecycle(csharpSource, 'csharp', csharpFile)
    expect(single.findings.map(finding => [finding.line, finding.id])).toEqual([
      [13, 'csharp-unpaired-subscription'],
      [13, 'loop-subscription'],
    ])
    expect(single.findings.every(finding => finding.severity === 'warning')).toBe(true)

    const batch = auditLifecycleBatch([
      { source: csharpSource, language: 'csharp', fileName: csharpFile },
      { source: gdscriptSource, language: 'gdscript', fileName: gdscriptFile },
    ])
    expect(batch.scriptCount).toBe(2)
    expect(batch.counts).toEqual({ info: 0, warning: 4, error: 0 })
    expect(batch.findings.map(finding => [finding.file, finding.line, finding.id])).toEqual([
      [csharpFile, 13, 'csharp-unpaired-subscription'],
      [csharpFile, 13, 'loop-subscription'],
      [gdscriptFile, 5, 'gdscript-unpaired-connect'],
      [gdscriptFile, 5, 'loop-subscription'],
    ])
    expect(() => auditScriptLifecycle(csharpSource, 'python' as ScriptLanguage, 'x.py')).toThrow(
      'unsupported language: python',
    )
  })
})

describe('measured performance evidence flows into symptom triage', () => {
  const SLOW_SAMPLES: readonly PerformanceSample[] = [
    {
      timestamp: 0,
      frameTimeMs: 40,
      cpuUsagePercent: 95,
      gpuUsagePercent: 40,
      memoryUsageBytes: 100_000_000,
      drawCallCount: 100,
      triangleCount: 5_000,
    },
    {
      timestamp: 16,
      frameTimeMs: 50,
      cpuUsagePercent: 97,
      gpuUsagePercent: 45,
      memoryUsageBytes: 110_000_000,
      drawCallCount: 120,
      triangleCount: 6_000,
    },
  ]

  const FIXED_SAMPLES: readonly PerformanceSample[] = [
    {
      timestamp: 0,
      frameTimeMs: 12,
      cpuUsagePercent: 40,
      gpuUsagePercent: 30,
      memoryUsageBytes: 90_000_000,
      drawCallCount: 80,
      triangleCount: 4_000,
    },
    {
      timestamp: 16,
      frameTimeMs: 14,
      cpuUsagePercent: 42,
      gpuUsagePercent: 32,
      memoryUsageBytes: 95_000_000,
      drawCallCount: 85,
      triangleCount: 4_200,
    },
  ]

  it('confirms the update-loop cause from analyzePerformance bottlenecks and compares against the baseline', () => {
    const slowRun = analyzePerformance(SLOW_SAMPLES, 60)
    expect(slowRun.profile.averageFrameTimeMs).toBe(45)
    expect(slowRun.bottlenecks.map(bottleneck => bottleneck.type)).toEqual(['cpu', 'cpu'])

    const fixedRun = analyzePerformance(FIXED_SAMPLES, 60)
    expect(fixedRun.bottlenecks).toEqual([])

    const diagnosis = diagnosePerformance(
      { kind: 'lag', description: 'combat scenes drop frames' },
      {
        profile: slowRun.profile,
        baselineProfile: fixedRun.profile,
        bottlenecks: slowRun.bottlenecks,
      },
    )
    expect(diagnosis.measured).toBe(true)

    const top = diagnosis.rankedCauses[0]
    expect(top?.causeId).toBe('update-loop-cost')
    expect(top?.likelihood).toBe('confirmed')
    expect(top?.confirmingEvidence[0]).toMatch('Average frame time 45.00ms')
    expect(top?.confirmingEvidence).toHaveLength(2)

    const gpuCause = diagnosis.rankedCauses.find(cause => cause.causeId === 'gpu-bound-rendering')
    expect(gpuCause?.likelihood).toBe('possible')
    expect(gpuCause?.missingEvidence).toContain(
      'GPU bottleneck attribution from analyzePerformance',
    )

    const stepById = new Map(diagnosis.steps.map(step => [step.id, step]))
    expect(stepById.get('reproduce')?.skipped).toBe(false)
    expect(stepById.get('check-update-loop')?.skipped).toBe(true)
    expect(stepById.get('check-update-loop')?.skipReason).toBe(
      'CPU bottleneck attribution already supplied',
    )
    expect(stepById.get('gpu-cpu-bottleneck')?.skipped).toBe(true)
    expect(stepById.get('compare-measurements')?.skipped).toBe(false)

    expect(diagnosis.baselineComparison?.improvement).toBe(false)
    expect(diagnosis.baselineComparison?.frameTimeChangePercent).toBeGreaterThan(240)
  })

  it('raises the shader cause to likely from a log finding and skips the log and shader steps', () => {
    const diagnosis = diagnosePerformance(
      { kind: 'stutter', description: 'hitches when entering combat' },
      {
        logFindings: [
          { category: 'shader-compilation', detail: 'Shader "Terrain" compiled during play' },
        ],
      },
    )
    expect(diagnosis.measured).toBe(false)
    expect(diagnosis.baselineComparison).toBeUndefined()

    const top = diagnosis.rankedCauses[0]
    expect(top?.causeId).toBe('shader-compilation-hitch')
    expect(top?.likelihood).toBe('likely')
    expect(top?.confirmingEvidence).toContain(
      'log finding (shader-compilation): Shader "Terrain" compiled during play',
    )

    const stepById = new Map(diagnosis.steps.map(step => [step.id, step]))
    expect(stepById.get('inspect-logs')?.skipped).toBe(true)
    expect(stepById.get('shader-asset-import')?.skipped).toBe(true)
    expect(stepById.get('re-run')?.skipped).toBe(false)
  })
})

describe('Unity meta GUIDs resolve scene reference findings', () => {
  const KNOWN_SCRIPT_GUID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
  const KNOWN_PREFAB_GUID = '0123456789abcdef0123456789abcdef'
  const UNKNOWN_GUID = 'fedcba9876543210fedcba9876543210'

  const UNITY_FILES = [
    'Assets/Scenes/Level.unity',
    'Assets/Prefabs/Hero.prefab',
    'Assets/Scripts/PlayerController.cs',
    'Packages/manifest.json',
    'ProjectSettings/ProjectVersion.txt',
  ]

  it('feeds collectGuids output into the reference audit and keeps known GUIDs and paths silent', () => {
    const detection = detectGameEngine(UNITY_FILES)
    expect(detection.engine).toBe('unity')
    expect(detection.confidence).toBe('high')

    const capability = buildGameProjectCapability(UNITY_FILES, 'projects/hero')
    expect(capability.engine).toBe('unity')
    expect(capability.projectRoot).toBe('projects/hero')
    expect(capability.supportedVerification).toContain('meta file audit')

    const collected = collectGuids([
      { path: 'Assets/Scripts/PlayerController.cs.meta', content: `guid: ${KNOWN_SCRIPT_GUID}\n` },
      {
        path: 'Assets/Prefabs/Hero.prefab.meta',
        content: `fileFormatVersion: 2\nguid: ${KNOWN_PREFAB_GUID.toUpperCase()}\n`,
      },
    ])
    expect(collected.map(entry => entry.guid)).toEqual([
      KNOWN_PREFAB_GUID,
      KNOWN_SCRIPT_GUID,
    ])

    const observedPaths = [...UNITY_FILES, 'Assets/Art/hero.png']
    const result = auditUnityReferences(
      [
        {
          scenePath: 'Assets/Scenes/Level.unity',
          text: [
            '%YAML 1.1',
            '--- !u!114 &200000',
            'MonoBehaviour:',
            `  m_Script: {fileID: 11500000, guid: ${KNOWN_SCRIPT_GUID}, type: 3}`,
            `  m_PrefabInstance: {fileID: 100100000, guid: ${UNKNOWN_GUID}, type: 3}`,
            '  m_Sprite: Assets/Art/hero.png',
          ].join('\n'),
        },
        {
          scenePath: 'Assets/Scenes/Broken.unity',
          text: [
            'SpriteRenderer:',
            `  m_Sprite: {fileID: 21300000, guid: ${KNOWN_PREFAB_GUID}}`,
            '  m_Icon: Assets/Missing/icon.png',
          ].join('\n'),
        },
      ],
      collected.map(entry => entry.guid),
      observedPaths,
    )

    expect(result.findings.map(finding => [finding.category, finding.file, finding.line])).toEqual([
      ['broken-path', 'Assets/Scenes/Broken.unity', 3],
      ['unresolved-guid', 'Assets/Scenes/Level.unity', 5],
    ])
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(true)
    expect(
      result.findings.some(finding => finding.message.includes(KNOWN_SCRIPT_GUID)),
    ).toBe(false)
  })
})

describe('parsed Godot scenes validate against the observed project files', () => {
  const GODOT_FILES = ['project.godot', 'Main.tscn', 'scripts/player.gd']

  it('detects the Godot project, parses the scene, and reports the missing resource and connection', () => {
    const capability = buildGameProjectCapability(GODOT_FILES, 'projects/space')
    expect(capability.engine).toBe('godot')
    expect(capability.supportedVerification).toContain('scene (.tscn) parsing')

    const scene = parseGodotScene(
      [
        '[gd_scene load_steps=3 format=3]',
        '',
        '[ext_resource type="Script" path="res://scripts/player.gd" id="1_a"]',
        '[ext_resource type="Texture2D" path="res://art/ship.png" id="2_b"]',
        '',
        '[node name="Main" type="Node2D"]',
        '',
        '[node name="Player" parent="." type="CharacterBody2D"]',
        '',
        '[node name="Weapon" parent="Player" type="Node2D"]',
        '',
        '[node name="UI" parent="." instance=ExtResource("2_b")]',
        '',
        '[connection signal="body_entered" from="Player" to="." method="_on_body_entered"]',
        '[connection signal="start" from="Menu/StartButton" to="." method="_on_start"]',
      ].join('\n'),
    )
    expect(formatGodotSceneSummary(scene)).toBe(
      'nodes=4 instanced=1 resources=2 connections=2 roots=1',
    )

    const result = validateGodotSceneIntegrity(scene, GODOT_FILES)
    expect(result.findings.map(finding => [finding.severity, finding.category])).toEqual([
      ['error', 'resource'],
      ['error', 'connection'],
    ])
    expect(result.findings[0]?.message).toContain('res://art/ship.png')
    expect(result.findings[1]?.message).toContain('Menu/StartButton')
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(false)
  })
})

describe('UI screens stay in sync with milestone progression', () => {
  const progression = {
    milestones: [
      {
        id: 'level-1',
        name: 'Level 1',
        description: 'Finish the first level',
        requiredObjectives: ['reach-flag'],
        unlockedCapabilities: ['dash'],
        complete: false,
      },
    ],
    completedObjectives: [],
    currentLevel: 'level-1',
    playTime: 60,
  }

  it('reports a victory screen shown before the win and a main menu over an active run', () => {
    const contradictoryUi: UIState = {
      screens: [
        { id: 'main-menu', visible: true, modal: true, closable: false, stackDepth: 0 },
        { id: 'victory', visible: true, modal: false, closable: false, stackDepth: 1 },
      ],
      focused: 'victory',
      modalActive: true,
      loading: false,
      errorMessage: null,
    }
    const issues = validateUiGameSync(contradictoryUi, progression)
    expect(issues.map(issue => issue.code)).toEqual([
      'victory-without-win',
      'main-menu-during-active-run',
    ])
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toBe('victory screen is visible but only 0 of 1 milestones are complete')
  })

  it('follows the screen transitions into a missed victory warning and then a synced state', () => {
    const hudUi = showScreen(hideScreen(DEFAULT_UI_STATE, 'main-menu').state, 'hud', false, true)
      .state
    expect(hudUi.screens.some(screen => screen.id === 'hud' && screen.visible)).toBe(true)

    const pending = canCompleteMilestone(progression, 'level-1')
    expect(pending.canComplete).toBe(false)
    expect(pending.reason).toBe('missing objectives: reach-flag')

    const completed = completeMilestone(
      { ...progression, completedObjectives: ['reach-flag'] },
      'level-1',
    )
    expect(completed.milestones[0]?.complete).toBe(true)

    const missedVictory = validateUiGameSync(hudUi, completed)
    expect(missedVictory.map(issue => issue.code)).toEqual(['win-without-victory-screen'])

    const victoryUi = showScreen(hudUi, 'victory', false, false).state
    expect(validateUiGameSync(victoryUi, completed)).toEqual([])
  })
})

const DESIGN_SPEC_WITH_PUZZLES = createGameDesignSpec({
  id: 'lock-quest',
  genre: 'puzzle',
  platforms: ['windows'],
  capabilities: [],
  interactions: [
    { id: 'door-blue', description: 'Open the blue door', trigger: 'use key-blue', affects: [] },
    { id: 'vault', description: 'Open the treasure vault', trigger: 'use key-red', affects: [] },
    { id: 'ice-lock', description: 'Melt the ice lock', trigger: 'use sun-gem', affects: [] },
    { id: 'moon-lock', description: 'Open the moon lock', trigger: 'use moon-gem', affects: [] },
  ],
  objectives: [
    {
      id: 'claim-crown',
      description: 'Claim the crown',
      completionCondition: 'Player holds the crown',
      required: true,
    },
  ],
  winConditions: [
    { id: 'claim-crown-win', description: 'Hold the crown', check: 'inventory contains crown' },
  ],
  failureConditions: [],
  progression: [],
  controls: {
    cameraType: 'top-down',
    controlScheme: 'keyboard',
    inputBindings: ['interact'],
  },
  art: { style: 'low-poly', palette: ['#101820', '#f2aa4c'], lighting: 'contrasty', assetGuidance: 'bold silhouettes' },
  audio: { music: 'puzzle motifs', soundEffects: 'lock clicks', spatialAudio: false },
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
})

describe('puzzle design reachability reports every soft-lock class', () => {
  it('derives the puzzle ids from the design interactions and finds each deadlock pattern', () => {
    const interactionTask = deriveGameDesignTasks(DESIGN_SPEC_WITH_PUZZLES)
      .find(task => task.id === 'interaction-wiring')
    expect(interactionTask?.description).toContain('door-blue, vault, ice-lock, moon-lock')

    const report = analyzeSoftLocks({
      items: ['key-blue'],
      puzzles: [
        { id: 'door-blue', name: 'Blue door', requiredItems: ['key-blue'], rewards: ['key-red'] },
        { id: 'vault', name: 'Treasure vault', requiredItems: ['key-red'], rewards: ['crown'] },
        { id: 'vault-alt', name: 'Side vault', requiredItems: ['brass-token'], rewards: ['crown'] },
        { id: 'ice-lock', name: 'Ice lock', requiredItems: ['sun-gem'], rewards: ['moon-gem'] },
        { id: 'moon-lock', name: 'Moon lock', requiredItems: ['moon-gem'], rewards: ['sun-gem'] },
      ],
      milestones: [
        {
          id: 'finish',
          name: 'Finish the game',
          requiredItems: ['crown'],
          requiredPuzzles: ['door-blue', 'vault', 'ghost-puzzle'],
        },
        {
          id: 'bonus',
          name: 'Bonus room',
          requiredItems: ['sun-gem'],
          requiredPuzzles: [],
        },
      ],
    })

    expect(report.reachableItems).toEqual(['key-blue', 'key-red', 'crown'])
    expect(report.hasCritical).toBe(true)
    expect(report.findings.map(finding => finding.code)).toEqual([
      'unreachable-milestone-item',
      'puzzle-unreachable-item',
      'mutual-deadlock',
      'unknown-puzzle-reference',
    ])
    const deadlock = report.findings.find(finding => finding.code === 'mutual-deadlock')
    expect(deadlock?.subject).toBe('ice-lock & moon-lock')
    const unknownPuzzle = report.findings.find(
      finding => finding.code === 'unknown-puzzle-reference',
    )
    expect(unknownPuzzle?.message).toContain('ghost-puzzle')
  })
})

describe('multi-agent coordination state gates integration approval', () => {
  const coordination = createCoordinationState({
    agents: [
      createAgentAssignment({
        agentId: 'architect',
        role: 'game-architect',
        taskIds: [],
        currentTask: null,
      }),
      createAgentAssignment({
        agentId: 'programmer',
        role: 'gameplay-programmer',
        taskIds: ['task-move'],
        currentTask: 'task-move',
      }),
    ],
    fileOwnership: [
      { filePath: 'src/player.cs', agentId: 'programmer' },
      { filePath: 'src/shared.cs', agentId: 'architect' },
      { filePath: 'src/shared.cs', agentId: 'programmer' },
      { filePath: 'src/legacy.cs', agentId: 'removed-agent' },
    ],
    taskAssignments: [{ taskId: 'task-move', agentId: 'programmer' }],
    pendingTasks: ['task-audio'],
    completedTasks: [],
    blockedTasks: [],
  })

  it('blocks the change set on the ownership conflict, the foreign owner, and the failed run', () => {
    const blocked = reviewIntegration(
      coordination,
      {
        files: [
          'src/player.cs',
          'src/shared.cs',
          'src/legacy.cs',
          'src/unowned.cs',
          'src/shared.cs',
        ],
      },
      { status: 'failed', failures: ['audio catalog test'] },
      [{ topic: 'engine choice', agents: ['architect', 'programmer'] }],
    )
    expect(blocked.approved).toBe(false)
    expect(blocked.summary).toBe('integration not approved: 5 findings')
    expect(blocked.findings.map(finding => finding.id)).toEqual([
      'changed-file-ownership-conflict',
      'changed-file-owner-out-of-scope',
      'changed-file-unowned',
      'tests-failed',
      'unresolved-disagreement',
    ])
    expect(blocked.findings.map(finding => finding.severity)).toEqual([
      'error',
      'error',
      'warning',
      'error',
      'error',
    ])
    expect(blocked.findings[3]?.message).toBe('recorded test run failed: audio catalog test')
  })

  it('approves an owned change set whose recorded run passed', () => {
    const assigned = assignTask(coordination, 'programmer', 'task-audio')
    expect(assigned.pendingTasks).toEqual([])
    expect(assigned.agents[1]?.taskIds).toEqual(['task-move', 'task-audio'])

    const owned = assignFileOwnership(assigned, 'src/player.cs', 'programmer')
    const approved = reviewIntegration(owned, { files: ['src/player.cs'] }, { status: 'passed' })
    expect(approved.findings).toEqual([])
    expect(approved.approved).toBe(true)
    expect(approved.summary).toBe('integration approved')
  })
})

describe('quality gate consumes the security and coverage audit adapters', () => {
  it('fails the gate when an adapted security check or the coverage gate fails', () => {
    const securityResults = runSecurityAudit([
      { name: 'level-path', value: 'Assets/Scenes/Level.unity' },
      { name: 'user-path', value: '../secrets.env' },
    ])
    const securityCategory = securityAuditChecks(securityResults)
    expect(securityCategory).toHaveLength(10)
    expect(securityCategory.filter(check => check.status === 'fail')).toHaveLength(2)

    const coverage = evaluateCoverageGate(
      [
        { path: 'src/a.ts', statements: 92, branches: 88, functions: 90, lines: 91 },
        { path: 'src/b.ts', statements: 55, branches: 60, functions: 50, lines: 58 },
      ],
      { statements: 80, branches: 75, functions: 80, lines: 80 },
    )
    expect(coverage.passed).toBe(false)
    expect(coverage.summary).toBe('coverage gate failed: 1 of 2 file(s)')

    const gate = evaluateGameQualityGate([
      {
        category: 'architecture',
        checks: [
          { id: 'architecture/ownership', question: 'Does the change stay in its package?', status: 'pass' },
        ],
      },
      {
        category: 'correctness',
        checks: [
          { id: 'correctness/invariants', question: 'Are the documented invariants kept?', status: 'pass' },
        ],
      },
      { category: 'security', checks: securityCategory },
      { category: 'testing', checks: coverageGateChecks(coverage) },
      {
        category: 'performance',
        checks: [
          { id: 'performance/hot-paths', question: 'Are hot paths free of quadratic work?', status: 'pass' },
        ],
      },
      {
        category: 'maintainability',
        checks: [
          { id: 'maintainability/export-docs', question: 'Do changed exports carry JSDoc?', status: 'pass' },
        ],
      },
    ])

    expect(gate.overallStatus).toBe('fail')
    expect(gate.results.map(result => [result.category, result.status])).toEqual([
      ['architecture', 'pass'],
      ['correctness', 'pass'],
      ['security', 'fail'],
      ['testing', 'fail'],
      ['performance', 'pass'],
      ['maintainability', 'pass'],
    ])
    expect(gate.failures.map(finding => finding.checkId)).toEqual([
      'security-audit/path-traversal',
      'security-audit/symlink-escape',
      'test-coverage/gate',
    ])
    expect(gate.notRun).toEqual([])
    expect(gate.substituteForTests).toBe(false)
  })

  it('passes only when every adapted check passes, and stays blocked on the untouched checklist', () => {
    const cleanSecurity = runSecurityAudit([
      { name: 'level-path', value: 'Assets/Scenes/Level.unity' },
    ])
    expect(cleanSecurity.every(result => result.passed)).toBe(true)

    const passingCoverage = evaluateCoverageGate(
      [
        { path: 'src/a.ts', statements: 92, branches: 88, functions: 90, lines: 91 },
        { path: 'src/c.ts', statements: 85, branches: 80, functions: 82, lines: 84 },
      ],
      { statements: 80, branches: 75, functions: 80, lines: 80 },
    )
    expect(passingCoverage.passed).toBe(true)

    const passCategory = (
      category: 'architecture' | 'correctness' | 'performance' | 'maintainability',
      id: string,
    ): QualityCategoryInput => ({
      category,
      checks: [{ id, question: `${id} reviewed?`, status: 'pass' }],
    })
    const gate = evaluateGameQualityGate([
      passCategory('architecture', 'architecture/ownership'),
      passCategory('correctness', 'correctness/invariants'),
      { category: 'security', checks: securityAuditChecks(cleanSecurity) },
      { category: 'testing', checks: coverageGateChecks(passingCoverage) },
      passCategory('performance', 'performance/hot-paths'),
      passCategory('maintainability', 'maintainability/export-docs'),
    ])
    expect(gate.overallStatus).toBe('pass')
    expect(gate.failures).toEqual([])
    expect(gate.notRun).toEqual([])
    expect(gate.substituteForTests).toBe(false)

    const untouched = evaluateGameQualityGate(QUALITY_GATE_CHECKLIST)
    expect(untouched.overallStatus).toBe('blocked')
    expect(untouched.results).toHaveLength(6)
    expect(untouched.results.every(result => result.status === 'blocked')).toBe(true)
    expect(untouched.notRun).toHaveLength(24)
  })
})

describe('barrel exposes every newly added game module', () => {
  it('keeps a representative function from each of the ten new modules reachable', () => {
    const representativeExports = [
      'requestPlayback',
      'deriveGameDesignTasks',
      'auditLifecycleBatch',
      'diagnosePerformance',
      'auditUnityReferences',
      'validateGodotSceneIntegrity',
      'validateUiGameSync',
      'analyzeSoftLocks',
      'reviewIntegration',
      'evaluateGameQualityGate',
    ]
    const barrelExports: Readonly<Record<string, unknown>> = { ...values }
    for (const name of representativeExports) {
      expect(typeof barrelExports[name], name).toBe('function')
    }
  })
})
