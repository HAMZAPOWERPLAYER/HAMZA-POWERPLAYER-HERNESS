import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MOBILE_BUDGET,
  assessDeviceCapability,
  classifyResultBasis,
  estimateAssetMemory,
  estimateFrameTime,
  estimateTotalMemory,
  formatBasis,
  isEstimate,
} from '../src/index.ts'

const MB = 1024 * 1024

describe('assessDeviceCapability', () => {
  it('gives low-tier devices a conservative budget', () => {
    const cap = assessDeviceCapability({
      tier: 'low',
      memoryBytes: 1024 * MB,
      gpuModel: 'Adreno 640',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(cap.tier).toBe('low')
    expect(cap.recommendedBudget.targetFps).toBe(30)
    expect(cap.recommendedBudget.frameBudgetMs).toBe(33.33)
    expect(cap.recommendedBudget.maxDrawCalls).toBe(50)
    expect(cap.recommendedBudget.maxTrianglesPerFrame).toBe(25000)
    expect(cap.features).toContain('mobile-gpu')
  })
  it('gives mid-tier devices a larger draw budget at the same frame rate', () => {
    const cap = assessDeviceCapability({
      tier: 'mid',
      memoryBytes: 1024 * MB,
      gpuModel: 'unknown',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(cap.recommendedBudget.targetFps).toBe(30)
    expect(cap.recommendedBudget.maxDrawCalls).toBe(100)
    expect(cap.recommendedBudget.maxTrianglesPerFrame).toBe(50000)
    expect(cap.features).toEqual([])
  })
  it('gives high-tier devices a 60fps budget', () => {
    const cap = assessDeviceCapability({
      tier: 'high',
      memoryBytes: 1024 * MB,
      gpuModel: 'unknown',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(cap.recommendedBudget.targetFps).toBe(60)
    expect(cap.recommendedBudget.frameBudgetMs).toBe(16.67)
    expect(cap.recommendedBudget.maxDrawCalls).toBe(200)
    expect(cap.recommendedBudget.maxTrianglesPerFrame).toBe(100000)
  })
  it('gives flagship devices the largest draw budget', () => {
    const cap = assessDeviceCapability({
      tier: 'flagship',
      memoryBytes: 1024 * MB,
      gpuModel: 'unknown',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(cap.recommendedBudget.targetFps).toBe(60)
    expect(cap.recommendedBudget.maxDrawCalls).toBe(400)
    expect(cap.recommendedBudget.maxTrianglesPerFrame).toBe(200000)
  })
  it('detects mobile GPUs case-insensitively', () => {
    const mali = assessDeviceCapability({
      tier: 'mid',
      memoryBytes: 1024 * MB,
      gpuModel: 'MALI-G78',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(mali.features).toContain('mobile-gpu')
    const powervr = assessDeviceCapability({
      tier: 'mid',
      memoryBytes: 1024 * MB,
      gpuModel: 'PowerVR GE8320',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(powervr.features).toContain('mobile-gpu')
  })
  it('does not flag desktop GPUs as mobile', () => {
    const cap = assessDeviceCapability({
      tier: 'high',
      memoryBytes: 1024 * MB,
      gpuModel: 'NVIDIA GeForce RTX 3080',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(cap.features).toEqual([])
  })
  it('flags screens at or above 1080p as high-resolution', () => {
    const exact = assessDeviceCapability({
      tier: 'mid',
      memoryBytes: 1024 * MB,
      gpuModel: 'Adreno 640',
      screenWidth: 1920,
      screenHeight: 1080,
    })
    expect(exact.features).toEqual(['mobile-gpu', 'high-resolution'])
    const below = assessDeviceCapability({
      tier: 'mid',
      memoryBytes: 1024 * MB,
      gpuModel: 'Adreno 640',
      screenWidth: 1919,
      screenHeight: 1080,
    })
    expect(below.features).toEqual(['mobile-gpu'])
  })
  it('requires at least the total memory budget to meet target FPS', () => {
    const base = { tier: 'high', gpuModel: 'unknown', screenWidth: 720, screenHeight: 1280 } as const
    const enough = assessDeviceCapability({ ...base, memoryBytes: 512 * MB })
    expect(enough.canMeetTargetFps).toBe(true)
    const notEnough = assessDeviceCapability({ ...base, memoryBytes: 512 * MB - 1 })
    expect(notEnough.canMeetTargetFps).toBe(false)
  })
})

describe('estimateAssetMemory', () => {
  it('estimates texture memory at four times file size', () => {
    const est = estimateAssetMemory('hero.png', MB, DEFAULT_MOBILE_BUDGET)
    expect(est.path).toBe('hero.png')
    expect(est.estimatedMemoryBytes).toBe(4 * MB)
    expect(est.exceedsBudget).toBe(false)
    expect(est.suggestions).toEqual([])
  })
  it('detects texture extensions case-insensitively', () => {
    const est = estimateAssetMemory('HERO.JPEG', MB, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedMemoryBytes).toBe(4 * MB)
  })
  it('suggests compression for textures estimated above 4MB', () => {
    const est = estimateAssetMemory('terrain.tga', 2 * MB, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedMemoryBytes).toBe(8 * MB)
    expect(est.suggestions).toContain('Consider compressing texture or reducing resolution')
  })
  it('estimates model memory at twice file size', () => {
    const small = estimateAssetMemory('ship.obj', 512 * 1024, DEFAULT_MOBILE_BUDGET)
    expect(small.estimatedMemoryBytes).toBe(1024 * 1024)
    expect(small.suggestions).toEqual([])
  })
  it('suggests polygon reduction for models estimated above 2MB', () => {
    const est = estimateAssetMemory('ship.fbx', 2 * MB, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedMemoryBytes).toBe(4 * MB)
    expect(est.suggestions).toContain('Consider reducing polygon count')
  })
  it('treats fbx paths as models even when the name mentions animation', () => {
    const est = estimateAssetMemory('run-anim.fbx', 1000, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedMemoryBytes).toBe(2000)
  })
  it('estimates audio at twice file size without suggestions below 10MB', () => {
    const small = estimateAssetMemory('sfx.mp3', 1000, DEFAULT_MOBILE_BUDGET)
    expect(small.estimatedMemoryBytes).toBe(2000)
    expect(small.suggestions).toEqual([])
  })
  it('suggests streaming for audio estimated above 10MB', () => {
    const est = estimateAssetMemory('music.ogg', 6 * MB, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedMemoryBytes).toBe(12 * MB)
    expect(est.suggestions).toContain('Consider streaming audio instead of loading fully')
  })
  it('estimates animation files at 1.5 times file size with no suggestions', () => {
    const est = estimateAssetMemory('walk.anim', 2000, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedMemoryBytes).toBe(3000)
    expect(est.suggestions).toEqual([])
  })
  it('passes other file types through at file size', () => {
    for (const path of ['config.json', 'level.tscn', 'icon.ttf', 'player.prefab', 'logic.cs']) {
      const est = estimateAssetMemory(path, 500, DEFAULT_MOBILE_BUDGET)
      expect(est.estimatedMemoryBytes).toBe(500)
      expect(est.suggestions).toEqual([])
    }
  })
  it('flags assets whose estimate exceeds the texture memory budget', () => {
    const small = { ...DEFAULT_MOBILE_BUDGET, textureMemoryBytes: 1000 }
    const atBudget = estimateAssetMemory('a.png', 250, small)
    expect(atBudget.estimatedMemoryBytes).toBe(1000)
    expect(atBudget.exceedsBudget).toBe(false)
    const overBudget = estimateAssetMemory('a.png', 251, small)
    expect(overBudget.estimatedMemoryBytes).toBe(1004)
    expect(overBudget.exceedsBudget).toBe(true)
  })
})

describe('estimateTotalMemory', () => {
  const small = { ...DEFAULT_MOBILE_BUDGET, textureMemoryBytes: 1000, totalMemoryBytes: 10000 }
  it('sums per-asset estimates', () => {
    const total = estimateTotalMemory(
      [
        { path: 'a.png', sizeBytes: 100 },
        { path: 'b.wav', sizeBytes: 50 },
      ],
      small,
    )
    expect(total.totalEstimatedBytes).toBe(500)
    expect(total.exceedsBudget).toBe(false)
    expect(total.overBudgetAssets).toEqual([])
  })
  it('lists over-budget assets sorted by path', () => {
    const total = estimateTotalMemory(
      [
        { path: 'z.png', sizeBytes: 400 },
        { path: 'a.png', sizeBytes: 400 },
      ],
      small,
    )
    expect(total.overBudgetAssets).toEqual(['a.png', 'z.png'])
    expect(total.exceedsBudget).toBe(false)
  })
  it('flags the total once it exceeds the memory budget', () => {
    const total = estimateTotalMemory([{ path: 'big.png', sizeBytes: 4000 }], small)
    expect(total.totalEstimatedBytes).toBe(16000)
    expect(total.exceedsBudget).toBe(true)
    expect(total.overBudgetAssets).toEqual(['big.png'])
  })
  it('totals zero for an empty asset list', () => {
    const total = estimateTotalMemory([], small)
    expect(total.totalEstimatedBytes).toBe(0)
    expect(total.exceedsBudget).toBe(false)
    expect(total.overBudgetAssets).toEqual([])
  })
})

describe('estimateFrameTime', () => {
  it('uses the slower of draw-call and triangle time', () => {
    const est = estimateFrameTime(100, 10000, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedFrameTimeMs).toBe(5)
    expect(est.exceedsBudget).toBe(false)
    expect(est.bottleneck).toBe('none')
  })
  it('flags a draw-call bottleneck above half the budget', () => {
    const est = estimateFrameTime(400, 10000, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedFrameTimeMs).toBe(20)
    expect(est.bottleneck).toBe('draw-calls')
    expect(est.exceedsBudget).toBe(false)
  })
  it('flags a triangle bottleneck above half the budget', () => {
    const est = estimateFrameTime(100, 300000, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedFrameTimeMs).toBe(30)
    expect(est.bottleneck).toBe('triangles')
    expect(est.exceedsBudget).toBe(false)
  })
  it('flags a triangle bottleneck that also exceeds the budget', () => {
    const est = estimateFrameTime(100, 400000, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedFrameTimeMs).toBe(40)
    expect(est.bottleneck).toBe('triangles')
    expect(est.exceedsBudget).toBe(true)
  })
  it('reports no bottleneck just below half the budget', () => {
    const est = estimateFrameTime(333, 10000, DEFAULT_MOBILE_BUDGET)
    expect(est.bottleneck).toBe('none')
    expect(est.exceedsBudget).toBe(false)
  })
  it('reports no bottleneck when both contributions are equal', () => {
    const est = estimateFrameTime(1000, 500000, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedFrameTimeMs).toBe(50)
    expect(est.bottleneck).toBe('none')
    expect(est.exceedsBudget).toBe(true)
  })
  it('does not exceed a budget exactly equal to the estimate', () => {
    const tight = { ...DEFAULT_MOBILE_BUDGET, frameBudgetMs: 10 }
    const est = estimateFrameTime(200, 0, tight)
    expect(est.estimatedFrameTimeMs).toBe(10)
    expect(est.exceedsBudget).toBe(false)
    expect(est.bottleneck).toBe('draw-calls')
  })
  it('estimates zero for no work', () => {
    const est = estimateFrameTime(0, 0, DEFAULT_MOBILE_BUDGET)
    expect(est.estimatedFrameTimeMs).toBe(0)
    expect(est.exceedsBudget).toBe(false)
    expect(est.bottleneck).toBe('none')
  })
})

describe('basis tagging', () => {
  it('tags every computation without measurements as an estimate', () => {
    const cap = assessDeviceCapability({
      tier: 'mid',
      memoryBytes: 1024 * MB,
      gpuModel: 'Adreno 640',
      screenWidth: 720,
      screenHeight: 1280,
    })
    expect(cap.basis).toBe('estimate')
    expect('measuredEnvironment' in cap).toBe(false)
    const asset = estimateAssetMemory('hero.png', MB, DEFAULT_MOBILE_BUDGET)
    expect(asset.basis).toBe('estimate')
    const total = estimateTotalMemory([{ path: 'a.png', sizeBytes: 100 }], DEFAULT_MOBILE_BUDGET)
    expect(total.basis).toBe('estimate')
    const frame = estimateFrameTime(100, 10000, DEFAULT_MOBILE_BUDGET)
    expect(frame.basis).toBe('estimate')
    expect('measuredEnvironment' in frame).toBe(false)
  })
  it('cannot report a measured basis when measurements are omitted', () => {
    const outputs = [
      assessDeviceCapability({
        tier: 'mid',
        memoryBytes: 1024 * MB,
        gpuModel: 'Adreno 640',
        screenWidth: 720,
        screenHeight: 1280,
      }),
      estimateAssetMemory('hero.png', MB, DEFAULT_MOBILE_BUDGET),
      estimateTotalMemory([{ path: 'a.png', sizeBytes: 100 }], DEFAULT_MOBILE_BUDGET),
      estimateFrameTime(100, 10000, DEFAULT_MOBILE_BUDGET),
    ]
    for (const output of outputs) {
      expect(output.basis).not.toBe('measured')
      expect(isEstimate(output.basis)).toBe(true)
      expect('measuredEnvironment' in output).toBe(false)
    }
  })
  it('classifies estimates and measurements against the verification ledger', () => {
    expect(classifyResultBasis('estimate')).toBe('inferred')
    expect(classifyResultBasis('measured')).toBe('observed-source')
    expect(isEstimate('measured')).toBe(false)
    expect(formatBasis('estimate')).toBe('estimate (not a measurement)')
    expect(formatBasis('measured')).toBe('measured (caller-supplied on an identified environment)')
  })
})

describe('measured inputs', () => {
  it('derives the FPS verdict from a measured sustained frame rate', () => {
    const cap = assessDeviceCapability({
      tier: 'high',
      memoryBytes: 64 * MB,
      gpuModel: 'unknown',
      screenWidth: 720,
      screenHeight: 1280,
      measurements: { sustainedFps: 61, environment: 'Pixel 7, release build, arena scene' },
    })
    expect(cap.basis).toBe('measured')
    expect(cap.measuredEnvironment).toBe('Pixel 7, release build, arena scene')
    expect(cap.canMeetTargetFps).toBe(true)
  })
  it('rejects a measured sustained frame rate below the target even when memory is ample', () => {
    const cap = assessDeviceCapability({
      tier: 'high',
      memoryBytes: 1024 * MB,
      gpuModel: 'unknown',
      screenWidth: 720,
      screenHeight: 1280,
      measurements: { sustainedFps: 24, environment: 'Pixel 7, release build, arena scene' },
    })
    expect(cap.basis).toBe('measured')
    expect(cap.canMeetTargetFps).toBe(false)
  })
  it('uses a measured asset memory footprint instead of the expansion estimate', () => {
    const measured = estimateAssetMemory('hero.png', MB, DEFAULT_MOBILE_BUDGET, {
      measuredMemoryBytes: 9 * MB,
    })
    expect(measured.basis).toBe('measured')
    expect(measured.estimatedMemoryBytes).toBe(9 * MB)
    expect(measured.exceedsBudget).toBe(false)
    expect(measured.suggestions).toContain('Consider compressing texture or reducing resolution')
    const small = { ...DEFAULT_MOBILE_BUDGET, textureMemoryBytes: 1000 }
    const under = estimateAssetMemory('hero.png', 5000, small, { measuredMemoryBytes: 500 })
    expect(under.estimatedMemoryBytes).toBe(500)
    expect(under.exceedsBudget).toBe(false)
  })
  it('uses a measured combined total while keeping per-asset attribution estimated', () => {
    const total = estimateTotalMemory(
      [
        { path: 'z.png', sizeBytes: 400 },
        { path: 'a.png', sizeBytes: 400 },
      ],
      { ...DEFAULT_MOBILE_BUDGET, textureMemoryBytes: 1000, totalMemoryBytes: 10000 },
      { measuredTotalBytes: 900 },
    )
    expect(total.basis).toBe('measured')
    expect(total.totalEstimatedBytes).toBe(900)
    expect(total.exceedsBudget).toBe(false)
    expect(total.overBudgetAssets).toEqual(['a.png', 'z.png'])
    const over = estimateTotalMemory(
      [{ path: 'a.png', sizeBytes: 100 }],
      { ...DEFAULT_MOBILE_BUDGET, textureMemoryBytes: 1000, totalMemoryBytes: 10000 },
      { measuredTotalBytes: 10001 },
    )
    expect(over.exceedsBudget).toBe(true)
  })
  it('uses a measured frame time, names the environment, and attributes no bottleneck', () => {
    const est = estimateFrameTime(400, 10000, DEFAULT_MOBILE_BUDGET, {
      measuredFrameTimeMs: 12.5,
      environment: 'Pixel 7, release build, arena scene',
    })
    expect(est.basis).toBe('measured')
    expect(est.estimatedFrameTimeMs).toBe(12.5)
    expect(est.exceedsBudget).toBe(false)
    expect(est.bottleneck).toBe('none')
    expect(est.measuredEnvironment).toBe('Pixel 7, release build, arena scene')
    const over = estimateFrameTime(100, 10000, DEFAULT_MOBILE_BUDGET, {
      measuredFrameTimeMs: 40,
      environment: 'Pixel 7, release build, arena scene',
    })
    expect(over.exceedsBudget).toBe(true)
  })
})

describe('invalid measured input', () => {
  it('rejects non-finite and negative measured values', () => {
    expect(() =>
      estimateFrameTime(100, 10000, DEFAULT_MOBILE_BUDGET, {
        measuredFrameTimeMs: Number.NaN,
        environment: 'Pixel 7',
      }),
    ).toThrow(/measuredFrameTimeMs must be finite and non-negative/)
    expect(() =>
      estimateFrameTime(100, 10000, DEFAULT_MOBILE_BUDGET, {
        measuredFrameTimeMs: -1,
        environment: 'Pixel 7',
      }),
    ).toThrow(/measuredFrameTimeMs must be finite and non-negative/)
    expect(() =>
      estimateAssetMemory('hero.png', MB, DEFAULT_MOBILE_BUDGET, {
        measuredMemoryBytes: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/measuredMemoryBytes must be finite and non-negative/)
    expect(() =>
      estimateAssetMemory('hero.png', MB, DEFAULT_MOBILE_BUDGET, { measuredMemoryBytes: -0.5 }),
    ).toThrow(/measuredMemoryBytes must be finite and non-negative/)
    expect(() =>
      estimateTotalMemory([], DEFAULT_MOBILE_BUDGET, { measuredTotalBytes: Number.NaN }),
    ).toThrow(/measuredTotalBytes must be finite and non-negative/)
    expect(() =>
      assessDeviceCapability({
        tier: 'mid',
        memoryBytes: 1024 * MB,
        gpuModel: 'unknown',
        screenWidth: 720,
        screenHeight: 1280,
        measurements: { sustainedFps: -5, environment: 'Pixel 7' },
      }),
    ).toThrow(/measured sustainedFps must be finite and non-negative/)
  })
  it('rejects measurements without an identified environment', () => {
    expect(() =>
      estimateFrameTime(100, 10000, DEFAULT_MOBILE_BUDGET, {
        measuredFrameTimeMs: 12,
        environment: '   ',
      }),
    ).toThrow(/measured environment must not be empty/)
    expect(() =>
      assessDeviceCapability({
        tier: 'mid',
        memoryBytes: 1024 * MB,
        gpuModel: 'unknown',
        screenWidth: 720,
        screenHeight: 1280,
        measurements: { sustainedFps: 30, environment: '' },
      }),
    ).toThrow(/measured environment must not be empty/)
  })
})
