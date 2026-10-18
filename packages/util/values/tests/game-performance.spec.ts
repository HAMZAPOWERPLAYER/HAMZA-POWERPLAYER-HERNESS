import { describe, expect, it } from 'vitest'
import {
  analyzePerformance,
  comparePerformanceProfiles,
  formatPerformanceProfile,
} from '../src/index.ts'

const MB = 1024 * 1024

function makeSample(overrides: {
  frameTimeMs?: number
  cpuUsagePercent?: number
  gpuUsagePercent?: number
  memoryUsageBytes?: number
  drawCallCount?: number
  triangleCount?: number
} = {}) {
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

function makeProfile(overrides: {
  sampleCount?: number
  averageFrameTimeMs?: number
  maxFrameTimeMs?: number
  minFrameTimeMs?: number
  averageCpuUsagePercent?: number
  averageGpuUsagePercent?: number
  averageMemoryUsageBytes?: number
  peakMemoryUsageBytes?: number
  averageDrawCallCount?: number
  averageTriangleCount?: number
  framesBelow60Fps?: number
  framesBelow30Fps?: number
} = {}) {
  return {
    sampleCount: overrides.sampleCount ?? 0,
    averageFrameTimeMs: overrides.averageFrameTimeMs ?? 0,
    maxFrameTimeMs: overrides.maxFrameTimeMs ?? 0,
    minFrameTimeMs: overrides.minFrameTimeMs ?? 0,
    averageCpuUsagePercent: overrides.averageCpuUsagePercent ?? 0,
    averageGpuUsagePercent: overrides.averageGpuUsagePercent ?? 0,
    averageMemoryUsageBytes: overrides.averageMemoryUsageBytes ?? 0,
    peakMemoryUsageBytes: overrides.peakMemoryUsageBytes ?? 0,
    averageDrawCallCount: overrides.averageDrawCallCount ?? 0,
    averageTriangleCount: overrides.averageTriangleCount ?? 0,
    framesBelow60Fps: overrides.framesBelow60Fps ?? 0,
    framesBelow30Fps: overrides.framesBelow30Fps ?? 0,
  }
}

function mixedSamples() {
  return [
    makeSample({ frameTimeMs: 10, cpuUsagePercent: 40, gpuUsagePercent: 50, memoryUsageBytes: 100 * MB, drawCallCount: 100, triangleCount: 50000 }),
    makeSample({ frameTimeMs: 20, cpuUsagePercent: 60, gpuUsagePercent: 70, memoryUsageBytes: 200 * MB, drawCallCount: 200, triangleCount: 150000 }),
    makeSample({ frameTimeMs: 30, cpuUsagePercent: 80, gpuUsagePercent: 90, memoryUsageBytes: 300 * MB, drawCallCount: 300, triangleCount: 250000 }),
    makeSample({ frameTimeMs: 40, cpuUsagePercent: 100, gpuUsagePercent: 100, memoryUsageBytes: 400 * MB, drawCallCount: 400, triangleCount: 350000 }),
  ]
}

describe('analyzePerformance', () => {
  it('returns a zeroed profile and no bottlenecks for empty samples', () => {
    const { profile, bottlenecks } = analyzePerformance([], 60)
    expect(profile.sampleCount).toBe(0)
    expect(profile.averageFrameTimeMs).toBe(0)
    expect(profile.maxFrameTimeMs).toBe(0)
    expect(profile.minFrameTimeMs).toBe(0)
    expect(profile.peakMemoryUsageBytes).toBe(0)
    expect(profile.framesBelow60Fps).toBe(0)
    expect(profile.framesBelow30Fps).toBe(0)
    expect(bottlenecks).toHaveLength(0)
  })

  it('computes profile statistics across samples', () => {
    const { profile } = analyzePerformance(mixedSamples(), 30)
    expect(profile).toEqual({
      sampleCount: 4,
      averageFrameTimeMs: 25,
      maxFrameTimeMs: 40,
      minFrameTimeMs: 10,
      averageCpuUsagePercent: 70,
      averageGpuUsagePercent: 77.5,
      averageMemoryUsageBytes: 250 * MB,
      peakMemoryUsageBytes: 400 * MB,
      averageDrawCallCount: 250,
      averageTriangleCount: 200000,
      framesBelow60Fps: 1,
      framesBelow30Fps: 3,
    })
  })

  it('reports only draw-call and triangle bottlenecks for a moderate profile at 30 FPS target', () => {
    const { bottlenecks } = analyzePerformance(mixedSamples(), 30)
    expect(bottlenecks).toEqual([
      {
        type: 'draw-calls',
        severity: 'medium',
        description: 'Average draw calls 250 per frame is high',
        suggestion: 'Batch draw calls and use GPU instancing',
      },
      {
        type: 'triangles',
        severity: 'medium',
        description: 'Average triangle count 200000 per frame is high',
        suggestion: 'Reduce polygon count and use LOD models',
      },
    ])
  })

  it('treats a single sample as average, max, and min alike', () => {
    const { profile } = analyzePerformance([makeSample({ frameTimeMs: 16 })], 60)
    expect(profile.sampleCount).toBe(1)
    expect(profile.averageFrameTimeMs).toBe(16)
    expect(profile.maxFrameTimeMs).toBe(16)
    expect(profile.minFrameTimeMs).toBe(16)
  })

  it('flags a cpu bottleneck when average frame time exceeds 1.5x the target', () => {
    const { bottlenecks } = analyzePerformance(
      [makeSample({ frameTimeMs: 40 }), makeSample({ frameTimeMs: 40 })],
      60,
    )
    expect(bottlenecks).toEqual([
      {
        type: 'cpu',
        severity: 'high',
        description: 'Average frame time 40.00ms exceeds target 16.67ms',
        suggestion: 'Optimize update loops and reduce per-frame computation',
      },
    ])
  })

  it('flags cpu, gpu, and memory bottlenecks above their thresholds', () => {
    const { bottlenecks } = analyzePerformance(
      [
        makeSample({ frameTimeMs: 20, cpuUsagePercent: 95, gpuUsagePercent: 95, memoryUsageBytes: 600 * MB }),
        makeSample({ frameTimeMs: 20, cpuUsagePercent: 95, gpuUsagePercent: 95, memoryUsageBytes: 600 * MB }),
      ],
      60,
    )
    expect(bottlenecks.map((b) => b.type)).toEqual(['cpu', 'gpu', 'memory'])
    expect(bottlenecks.map((b) => b.severity)).toEqual(['high', 'high', 'high'])
    expect(bottlenecks.map((b) => b.description)).toContain('Peak memory usage 600.0MB is high')
  })

  it('counts frame times exactly at the 60 and 30 FPS thresholds as within budget', () => {
    const { profile } = analyzePerformance(
      [
        makeSample({ frameTimeMs: 1000 / 60 }),
        makeSample({ frameTimeMs: 1000 / 30 }),
        makeSample({ frameTimeMs: 17 }),
      ],
      60,
    )
    expect(profile.framesBelow60Fps).toBe(1)
    expect(profile.framesBelow30Fps).toBe(3)
  })
})

describe('comparePerformanceProfiles', () => {
  it('computes signed percent changes and improvement', () => {
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
    expect(comparePerformanceProfiles(before, after)).toEqual({
      frameTimeChangePercent: -50,
      cpuChangePercent: -50,
      gpuChangePercent: 25,
      memoryChangePercent: 100,
      improvement: true,
    })
  })

  it('reports a regression when average frame time increases', () => {
    const before = makeProfile({ averageFrameTimeMs: 20 })
    const after = makeProfile({ averageFrameTimeMs: 30 })
    const comparison = comparePerformanceProfiles(before, after)
    expect(comparison.frameTimeChangePercent).toBe(50)
    expect(comparison.improvement).toBe(false)
  })

  it('does not count equal average frame times as an improvement', () => {
    const before = makeProfile({ averageFrameTimeMs: 20 })
    const after = makeProfile({ averageFrameTimeMs: 20 })
    expect(comparePerformanceProfiles(before, after).improvement).toBe(false)
  })

  it('yields zero change percents when the before averages are zero', () => {
    const before = makeProfile()
    const after = makeProfile({
      averageFrameTimeMs: 16,
      averageCpuUsagePercent: 80,
      averageGpuUsagePercent: 90,
      averageMemoryUsageBytes: 512,
    })
    expect(comparePerformanceProfiles(before, after)).toEqual({
      frameTimeChangePercent: 0,
      cpuChangePercent: 0,
      gpuChangePercent: 0,
      memoryChangePercent: 0,
      improvement: false,
    })
  })

  it('yields zero percents for identical profiles', () => {
    const profile = makeProfile({
      averageFrameTimeMs: 20,
      averageCpuUsagePercent: 50,
      averageGpuUsagePercent: 40,
      averageMemoryUsageBytes: 100,
    })
    expect(comparePerformanceProfiles(profile, profile)).toEqual({
      frameTimeChangePercent: 0,
      cpuChangePercent: 0,
      gpuChangePercent: 0,
      memoryChangePercent: 0,
      improvement: false,
    })
  })
})

describe('formatPerformanceProfile', () => {
  it('renders every profile field', () => {
    const { profile } = analyzePerformance(mixedSamples(), 30)
    const text = formatPerformanceProfile(profile)
    expect(text.startsWith('Performance Profile:')).toBe(true)
    for (const line of [
      'Samples: 4',
      'Average Frame Time: 25.00ms (40.0 FPS)',
      'Max Frame Time: 40.00ms',
      'Min Frame Time: 10.00ms',
      'Average CPU: 70.0%',
      'Average GPU: 77.5%',
      'Average Memory: 250.00MB',
      'Peak Memory: 400.00MB',
      'Average Draw Calls: 250',
      'Average Triangles: 200000',
      'Frames <= 60 FPS: 1 (25.0%)',
      'Frames <= 30 FPS: 3 (75.0%)',
    ]) {
      expect(text).toContain(line)
    }
  })

  it('trims surrounding whitespace so the summary starts and ends with content', () => {
    const { profile } = analyzePerformance(mixedSamples(), 30)
    const text = formatPerformanceProfile(profile)
    expect(text.startsWith('\n')).toBe(false)
    expect(text.endsWith('Frames <= 30 FPS: 3 (75.0%)')).toBe(true)
  })
})
