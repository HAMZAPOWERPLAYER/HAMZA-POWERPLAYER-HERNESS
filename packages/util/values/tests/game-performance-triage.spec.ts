import { describe, expect, it } from 'vitest'
import {
  PERFORMANCE_TRIAGE_STEPS,
  diagnosePerformance,
  validatePerformanceProfile,
  type PerformanceLogFinding,
  type PerformanceSymptom,
  type PerformanceTriageEvidence,
} from '../src/game-performance-triage.ts'
import {
  analyzePerformance,
  comparePerformanceProfiles,
  type PerformanceProfile,
  type PerformanceSample,
} from '../src/game-performance.ts'

const MB = 1024 * 1024

const STEP_ORDER = [
  'reproduce',
  'inspect-logs',
  'check-update-loop',
  'scene-transition-loading',
  'shader-asset-import',
  'memory-allocations',
  'gpu-cpu-bottleneck',
  'identify-most-likely-cause',
  'targeted-fix',
  're-run',
  'compare-measurements',
] as const

function symptom(kind: PerformanceSymptom['kind'], description = 'reported during play'): PerformanceSymptom {
  return { kind, description }
}

function sample(overrides: {
  frameTimeMs?: number
  cpuUsagePercent?: number
  gpuUsagePercent?: number
  memoryUsageBytes?: number
  drawCallCount?: number
  triangleCount?: number
} = {}): PerformanceSample {
  return {
    timestamp: 0,
    frameTimeMs: overrides.frameTimeMs ?? 16,
    cpuUsagePercent: overrides.cpuUsagePercent ?? 50,
    gpuUsagePercent: overrides.gpuUsagePercent ?? 50,
    memoryUsageBytes: overrides.memoryUsageBytes ?? MB,
    drawCallCount: overrides.drawCallCount ?? 10,
    triangleCount: overrides.triangleCount ?? 1000,
  }
}

function makeProfile(overrides: Partial<PerformanceProfile> = {}): PerformanceProfile {
  return {
    sampleCount: 1,
    averageFrameTimeMs: 16,
    maxFrameTimeMs: 16,
    minFrameTimeMs: 16,
    averageCpuUsagePercent: 50,
    averageGpuUsagePercent: 50,
    averageMemoryUsageBytes: MB,
    peakMemoryUsageBytes: MB,
    averageDrawCallCount: 10,
    averageTriangleCount: 1000,
    framesBelow60Fps: 1,
    framesBelow30Fps: 0,
    ...overrides,
  }
}

function cpuAttribution() {
  return analyzePerformance([sample({ frameTimeMs: 40 }), sample({ frameTimeMs: 40 })], 60)
}

function drawCallAttribution() {
  return analyzePerformance([sample({ frameTimeMs: 10, drawCallCount: 300 })], 60)
}

function memoryAttribution() {
  return analyzePerformance([sample({ frameTimeMs: 10, memoryUsageBytes: 600 * MB })], 60)
}

function skippedIds(result: ReturnType<typeof diagnosePerformance>): string[] {
  return result.steps.filter((step) => step.skipped).map((step) => step.id)
}

describe('PERFORMANCE_TRIAGE_STEPS', () => {
  it('lists eleven steps in workflow order', () => {
    expect(PERFORMANCE_TRIAGE_STEPS.map((step) => step.id)).toEqual([...STEP_ORDER])
  })
  it('has unique step ids', () => {
    const ids = PERFORMANCE_TRIAGE_STEPS.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('documents action, required evidence, and skip condition for every step', () => {
    for (const step of PERFORMANCE_TRIAGE_STEPS) {
      expect(step.action.length).toBeGreaterThan(0)
      expect(step.evidenceRequired.length).toBeGreaterThan(0)
      expect(step.skipCondition.length).toBeGreaterThan(0)
    }
  })
})

describe('diagnosePerformance symptom kinds', () => {
  it('runs the full workflow for lag with the update loop ranked first', () => {
    const result = diagnosePerformance(symptom('lag', 'frame rate drops in crowded rooms'))
    expect(result.steps.map((step) => step.id)).toEqual([...STEP_ORDER])
    expect(result.rankedCauses.map((cause) => cause.causeId)).toEqual([
      'update-loop-cost',
      'gpu-bound-rendering',
      'draw-call-overhead',
      'geometry-overload',
      'memory-pressure',
    ])
    expect('baselineComparison' in result).toBe(false)
  })
  it('runs the full workflow for stutter with shader compilation ranked first', () => {
    const result = diagnosePerformance(symptom('stutter', 'hitch every few seconds'))
    expect(result.steps).toHaveLength(11)
    expect(result.rankedCauses.map((cause) => cause.causeId)).toEqual([
      'shader-compilation-hitch',
      'allocation-churn',
      'scene-transition-load',
      'asset-import-hitch',
      'draw-call-overhead',
    ])
  })
  it('runs the full workflow for freeze with scene transitions ranked first', () => {
    const result = diagnosePerformance(symptom('freeze', 'game stops for two seconds'))
    expect(result.steps).toHaveLength(11)
    expect(result.rankedCauses.map((cause) => cause.causeId)).toEqual([
      'scene-transition-load',
      'update-loop-cost',
      'allocation-churn',
      'asset-import-hitch',
      'memory-pressure',
    ])
  })
  it('runs the full workflow for black-screen with a render error ranked first', () => {
    const result = diagnosePerformance(symptom('black-screen', 'screen stays black after the intro'))
    expect(result.steps).toHaveLength(11)
    expect(result.rankedCauses.map((cause) => cause.causeId)).toEqual([
      'render-pipeline-error',
      'shader-compilation-hitch',
      'scene-transition-load',
      'gpu-bound-rendering',
    ])
  })
})

describe('diagnosePerformance guards', () => {
  it('throws for an unknown symptom kind', () => {
    const unknown = { kind: 'rain', description: 'drops' } as PerformanceSymptom
    expect(() => diagnosePerformance(unknown)).toThrow(/unknown symptom kind: rain/)
  })
  it('rejects a profile with a negative frame time', () => {
    const bad = makeProfile({ averageFrameTimeMs: -1 })
    expect(() => diagnosePerformance(symptom('lag'), bad)).toThrow(
      /performance profile is not valid: averageFrameTimeMs must be finite and non-negative/,
    )
  })
  it('rejects a baseline profile with a non-finite frame time', () => {
    const evidence: PerformanceTriageEvidence = {
      profile: makeProfile(),
      baselineProfile: makeProfile({ maxFrameTimeMs: Number.NaN }),
    }
    expect(() => diagnosePerformance(symptom('lag'), evidence)).toThrow(
      /^baseline performance profile is not valid: maxFrameTimeMs must be finite and non-negative/,
    )
  })
})

describe('validatePerformanceProfile', () => {
  it('reports no problem for usable frame times', () => {
    expect(validatePerformanceProfile(makeProfile())).toEqual([])
  })
  it('reports each unusable frame-time field in report order', () => {
    const bad = makeProfile({ averageFrameTimeMs: Number.NaN, minFrameTimeMs: -2 })
    expect(validatePerformanceProfile(bad)).toEqual([
      'averageFrameTimeMs must be finite and non-negative',
      'minFrameTimeMs must be finite and non-negative',
    ])
  })
})

describe('diagnosePerformance skip decisions', () => {
  it('skips only the comparison step when no evidence is supplied', () => {
    const result = diagnosePerformance(symptom('lag'))
    expect(skippedIds(result)).toEqual(['compare-measurements'])
    const compare = result.steps.find((step) => step.id === 'compare-measurements')
    expect(compare?.skipReason).toBe('no profiles supplied for comparison')
  })
  it('skips log-dependent steps when log findings are supplied', () => {
    const logFindings: PerformanceLogFinding[] = [
      { category: 'scene-transition', detail: 'loading took 1.8s' },
      { category: 'shader-compilation', detail: 'compiled terrain shader' },
      { category: 'out-of-memory', detail: 'allocation failed at 610MB' },
    ]
    const result = diagnosePerformance(symptom('lag'), { logFindings })
    expect(skippedIds(result)).toEqual([
      'inspect-logs',
      'scene-transition-loading',
      'shader-asset-import',
      'memory-allocations',
      'compare-measurements',
    ])
    expect(result.steps.find((step) => step.id === 'check-update-loop')?.skipped).toBe(false)
    expect(result.steps.find((step) => step.id === 'gpu-cpu-bottleneck')?.skipped).toBe(false)
    for (const step of result.steps) {
      if (step.skipped) {
        expect(typeof step.skipReason).toBe('string')
      } else {
        expect(step.skipReason).toBeUndefined()
      }
    }
  })
  it('skips the update-loop and bottleneck steps when CPU attribution is supplied', () => {
    const { profile, bottlenecks } = cpuAttribution()
    const result = diagnosePerformance(symptom('lag'), { profile, bottlenecks })
    expect(skippedIds(result)).toEqual(['check-update-loop', 'gpu-cpu-bottleneck', 'compare-measurements'])
  })
  it('skips the memory and bottleneck steps when memory attribution is supplied', () => {
    const { profile, bottlenecks } = memoryAttribution()
    const result = diagnosePerformance(symptom('lag'), { profile, bottlenecks })
    expect(skippedIds(result)).toEqual(['memory-allocations', 'gpu-cpu-bottleneck', 'compare-measurements'])
  })
  it('skips the comparison step when only a current profile is supplied', () => {
    const result = diagnosePerformance(symptom('lag'), makeProfile())
    expect(skippedIds(result)).toEqual(['compare-measurements'])
    const compare = result.steps.find((step) => step.id === 'compare-measurements')
    expect(compare?.skipReason).toBe('baseline profile not supplied')
    expect('baselineComparison' in result).toBe(false)
  })
  it('runs the comparison step when both profiles are supplied', () => {
    const evidence: PerformanceTriageEvidence = {
      profile: makeProfile(),
      baselineProfile: makeProfile(),
    }
    const result = diagnosePerformance(symptom('lag'), evidence)
    expect(skippedIds(result)).toEqual([])
  })
})

describe('diagnosePerformance evidence discipline', () => {
  it('reports no measurement and no confirmed cause when no evidence is supplied', () => {
    const result = diagnosePerformance(symptom('lag'))
    expect(result.measured).toBe(false)
    expect(result.rankedCauses.length).toBeGreaterThan(0)
    for (const cause of result.rankedCauses) {
      expect(cause.likelihood).not.toBe('confirmed')
      expect(cause.confirmingEvidence).toEqual([])
      expect(cause.missingEvidence.length).toBeGreaterThan(0)
    }
    const updateLoop = result.rankedCauses.find((cause) => cause.causeId === 'update-loop-cost')
    expect(updateLoop?.missingEvidence).toContain('CPU bottleneck attribution from analyzePerformance')
  })
  it('confirms the draw-call cause from supplied bottleneck attribution', () => {
    const { profile, bottlenecks } = drawCallAttribution()
    const result = diagnosePerformance(symptom('lag'), { profile, bottlenecks })
    expect(result.measured).toBe(true)
    expect(result.rankedCauses[0]?.causeId).toBe('draw-call-overhead')
    expect(result.rankedCauses[0]?.likelihood).toBe('confirmed')
    expect(result.rankedCauses[0]?.confirmingEvidence).toEqual([
      'bottleneck attribution: Average draw calls 300 per frame is high',
    ])
    expect(result.rankedCauses[0]?.missingEvidence).toEqual([])
  })
  it('keeps uncorroborated evidence kinds listed as missing on a confirmed cause', () => {
    const { profile, bottlenecks } = cpuAttribution()
    const result = diagnosePerformance(symptom('lag'), { profile, bottlenecks })
    const updateLoop = result.rankedCauses.find((cause) => cause.causeId === 'update-loop-cost')
    expect(updateLoop?.likelihood).toBe('confirmed')
    expect(updateLoop?.confirmingEvidence).toEqual([
      'bottleneck attribution: Average frame time 40.00ms exceeds target 16.67ms',
    ])
    expect(updateLoop?.missingEvidence).toEqual([
      'profile whose average CPU usage exceeds its average GPU usage',
    ])
  })
  it('treats bottleneck attribution as measurement evidence even without a profile', () => {
    const { bottlenecks } = cpuAttribution()
    const result = diagnosePerformance(symptom('lag'), { bottlenecks })
    expect(result.measured).toBe(true)
    expect(result.rankedCauses[0]?.likelihood).toBe('confirmed')
  })
  it('raises a cause to likely from a log finding without confirming it', () => {
    const logFindings: PerformanceLogFinding[] = [
      { category: 'shader-compilation', detail: 'compiled 42 shaders mid-frame' },
    ]
    const result = diagnosePerformance(symptom('stutter'), { logFindings })
    expect(result.measured).toBe(false)
    const shader = result.rankedCauses.find((cause) => cause.causeId === 'shader-compilation-hitch')
    expect(shader?.likelihood).toBe('likely')
    expect(shader?.confirmingEvidence).toEqual([
      'log finding (shader-compilation): compiled 42 shaders mid-frame',
    ])
    expect(shader?.missingEvidence).toEqual([])
    expect(result.rankedCauses.every((cause) => cause.likelihood !== 'confirmed')).toBe(true)
  })
  it('raises the update-loop cause from a CPU-dominant profile without confirming it', () => {
    const profile = makeProfile({ averageFrameTimeMs: 30, averageCpuUsagePercent: 90, averageGpuUsagePercent: 30 })
    const result = diagnosePerformance(symptom('lag'), profile)
    expect(result.measured).toBe(true)
    expect(result.rankedCauses[0]?.causeId).toBe('update-loop-cost')
    expect(result.rankedCauses[0]?.likelihood).toBe('likely')
    expect(result.rankedCauses[0]?.confirmingEvidence).toEqual([
      'profile: average CPU usage 90% exceeds average GPU usage 30%',
    ])
    expect(result.rankedCauses.every((cause) => cause.likelihood !== 'confirmed')).toBe(true)
  })
  it('keeps both evidence kinds listed as missing on an unevidenced profile', () => {
    const result = diagnosePerformance(symptom('lag'), makeProfile())
    const updateLoop = result.rankedCauses.find((cause) => cause.causeId === 'update-loop-cost')
    expect(updateLoop?.likelihood).toBe('possible')
    expect(updateLoop?.confirmingEvidence).toEqual([])
    expect(updateLoop?.missingEvidence).toEqual([
      'CPU bottleneck attribution from analyzePerformance',
      'profile whose average CPU usage exceeds its average GPU usage',
    ])
  })
  it('ranks a raised cause outside the symptom prior ahead of possible causes', () => {
    const logFindings: PerformanceLogFinding[] = [
      { category: 'render-error', detail: 'shader link failed' },
    ]
    const result = diagnosePerformance(symptom('lag'), { logFindings })
    expect(result.rankedCauses.map((cause) => cause.causeId)).toEqual([
      'render-pipeline-error',
      'update-loop-cost',
      'gpu-bound-rendering',
      'draw-call-overhead',
      'geometry-overload',
      'memory-pressure',
    ])
    expect(result.rankedCauses[0]?.likelihood).toBe('likely')
    expect(result.measured).toBe(false)
  })
})

describe('diagnosePerformance baseline comparison', () => {
  it('reuses comparePerformanceProfiles for two supplied profiles', () => {
    const before = makeProfile({
      averageFrameTimeMs: 20,
      averageCpuUsagePercent: 50,
      averageGpuUsagePercent: 40,
      averageMemoryUsageBytes: 100,
    })
    const after = makeProfile({
      averageFrameTimeMs: 10,
      averageCpuUsagePercent: 25,
      averageGpuUsagePercent: 50,
      averageMemoryUsageBytes: 200,
    })
    const result = diagnosePerformance(symptom('lag'), { profile: after, baselineProfile: before })
    expect(result.measured).toBe(true)
    expect(result.baselineComparison).toEqual(comparePerformanceProfiles(before, after))
    expect(result.baselineComparison?.frameTimeChangePercent).toBe(-50)
    const compare = result.steps.find((step) => step.id === 'compare-measurements')
    expect(compare?.skipped).toBe(false)
  })
  it('accepts a bare profile as the second argument', () => {
    const result = diagnosePerformance(symptom('freeze'), makeProfile({ averageFrameTimeMs: 45 }))
    expect(result.measured).toBe(true)
    expect('baselineComparison' in result).toBe(false)
  })
})

describe('diagnosePerformance purity', () => {
  it('leaves its inputs unchanged and repeats deterministically', () => {
    const reported = symptom('stutter', 'hitch every few seconds')
    const evidence: PerformanceTriageEvidence = {
      profile: makeProfile({ averageFrameTimeMs: 33 }),
      bottlenecks: drawCallAttribution().bottlenecks,
      logFindings: [{ category: 'allocation-spike', detail: 'GC pause 90ms' }],
    }
    const symptomBefore = JSON.stringify(reported)
    const evidenceBefore = JSON.stringify(evidence)
    const stepsBefore = PERFORMANCE_TRIAGE_STEPS.map((step) => step.id).join('|')
    const first = diagnosePerformance(reported, evidence)
    const second = diagnosePerformance(reported, evidence)
    expect(JSON.stringify(reported)).toBe(symptomBefore)
    expect(JSON.stringify(evidence)).toBe(evidenceBefore)
    expect(PERFORMANCE_TRIAGE_STEPS.map((step) => step.id).join('|')).toBe(stepsBefore)
    expect(second).toEqual(first)
  })
})
