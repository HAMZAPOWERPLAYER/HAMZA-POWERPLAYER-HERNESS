/**
 * Mobile optimization model.
 *
 * Provides mobile performance budgeting, resource estimation, and platform
 * compatibility checks for mobile game development. All helpers are pure:
 * they compute budgets and estimates from caller-supplied input, perform no
 * I/O, and hold no state.
 *
 * Every computed output carries a `basis` field with value `'estimate'` or
 * `'measured'`. All values this module computes on its own are estimates:
 * they come from a rough model, not from running a game on a device, and
 * must not be quoted as achieved frame rates or measured memory usage. A
 * caller that holds real on-device measurements passes them through the
 * optional `measurements` input of the matching function; the result then
 * uses the measured value and carries `basis: 'measured'`. No output reports
 * `'measured'` unless the caller supplied the measurement, and frame-rate
 * claims require the measurement to name the environment it was taken on.
 *
 * `./verification.ts` classifies how claims about completed work were
 * checked through commands and sources. Its `Claim` and `EvidenceRecord`
 * types do not fit these numeric results, whose only origin question is
 * estimate versus measurement, so this module defines the two-value
 * {@link ResultBasis} instead and maps it onto the shared evidence
 * categories through {@link classifyResultBasis}.
 *
 * @module @deepseek-ai/dsh-util-values/mobile-optimization
 */

import type { EvidenceCategory } from './verification.ts';

/** Mobile device tier. */
export type MobileDeviceTier = 'low' | 'mid' | 'high' | 'flagship';

/**
 * How a value computed by this module was obtained: `'estimate'` when the
 * value came from this module's rough model, `'measured'` when it came from
 * a measurement the caller supplied.
 */
export type ResultBasis = 'estimate' | 'measured';

/**
 * Whether a result basis marks a value as an estimate rather than a
 * measurement.
 *
 * @param basis - the basis to test.
 * @returns `true` when the basis is `'estimate'`.
 */
export function isEstimate(basis: ResultBasis): boolean {
  return basis === 'estimate';
}

/**
 * Human-readable label for a result basis, for reports that must distinguish
 * estimates from measurements.
 *
 * @param basis - the basis to describe.
 * @returns `'estimate (not a measurement)'` for estimates and `'measured (caller-supplied on an identified environment)'` for measurements.
 */
export function formatBasis(basis: ResultBasis): string {
  return basis === 'measured'
    ? 'measured (caller-supplied on an identified environment)'
    : 'estimate (not a measurement)';
}

/**
 * Map a result basis onto the evidence categories of `./verification.ts` so
 * that mobile results can be recorded in a verification ledger next to
 * command and source evidence.
 *
 * @param basis - the basis to classify.
 * @returns `'observed-source'` for measured results and `'inferred'` for estimates.
 */
export function classifyResultBasis(basis: ResultBasis): EvidenceCategory {
  return basis === 'measured' ? 'observed-source' : 'inferred';
}

/**
 * Reject a caller-supplied measured value that cannot be a real measurement.
 *
 * @param value - the measured numeric value to validate.
 * @param label - field name used in the error message.
 */
function requireValidMeasurement(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative: ${value}`);
  }
}

/**
 * Reject a measurement whose environment description is empty, since a
 * frame-rate or memory claim without an identified environment cannot be
 * interpreted.
 *
 * @param environment - the environment description to validate.
 */
function requireIdentifiedEnvironment(environment: string): void {
  if (environment.trim() === '') {
    throw new Error('measured environment must not be empty');
  }
}

/** Mobile performance budget. */
export interface MobilePerformanceBudget {
  /** Target frame rate. */
  readonly targetFps: number;
  /** Frame budget in milliseconds (1000 / targetFps). */
  readonly frameBudgetMs: number;
  /** Texture memory budget in bytes. */
  readonly textureMemoryBytes: number;
  /** Mesh memory budget in bytes. */
  readonly meshMemoryBytes: number;
  /** Audio memory budget in bytes. */
  readonly audioMemoryBytes: number;
  /** Total memory budget in bytes. */
  readonly totalMemoryBytes: number;
  /** Maximum draw calls per frame. */
  readonly maxDrawCalls: number;
  /** Maximum triangle count per frame. */
  readonly maxTrianglesPerFrame: number;
  /** Maximum overdraw factor. */
  readonly maxOverdrawFactor: number;
}

/** Default mobile performance budget for low-end devices. */
export const DEFAULT_MOBILE_BUDGET: MobilePerformanceBudget = {
  targetFps: 30,
  frameBudgetMs: 33.33,
  textureMemoryBytes: 256 * 1024 * 1024,
  meshMemoryBytes: 128 * 1024 * 1024,
  audioMemoryBytes: 64 * 1024 * 1024,
  totalMemoryBytes: 512 * 1024 * 1024,
  maxDrawCalls: 100,
  maxTrianglesPerFrame: 50000,
  maxOverdrawFactor: 2.0,
};

/** Caller-supplied on-device measurement for {@link assessDeviceCapability}. */
export interface DeviceMeasurements {
  /** Sustained frame rate observed on the device. */
  readonly sustainedFps: number;
  /** Description of the device, build, and scene the sustained frame rate was measured on. */
  readonly environment: string;
}

/** Device capability assessment. */
export interface DeviceCapability {
  /** Device tier. */
  readonly tier: MobileDeviceTier;
  /** Supported rendering features. */
  readonly features: readonly string[];
  /** Recommended performance budget. Always an estimate: a tier-table lookup, never a measurement. */
  readonly recommendedBudget: MobilePerformanceBudget;
  /**
   * Whether the device can run the game at target FPS. Derived from the
   * measured sustained frame rate when {@link assessDeviceCapability}
   * received measurements, otherwise estimated by comparing available memory
   * against the budget.
   */
  readonly canMeetTargetFps: boolean;
  /** How {@link DeviceCapability.canMeetTargetFps} was obtained. */
  readonly basis: ResultBasis;
  /**
   * Environment the measured sustained frame rate was taken on. Present
   * exactly when {@link DeviceCapability.basis} is `'measured'`.
   */
  readonly measuredEnvironment?: string;
}

/**
 * Assess device capability from observed specs.
 *
 * Without `spec.measurements` the `canMeetTargetFps` verdict is a
 * memory-based estimate and must not be quoted as an achieved frame rate.
 * Supplying a real sustained-FPS measurement makes the verdict measured on
 * the named environment.
 *
 * @param spec - observed device tier, memory, GPU model, screen resolution, and optional measured sustained FPS with its environment.
 * @returns capability with a tier-scaled budget, detected features, the FPS verdict with its basis, and the measurement environment when measured.
 */
export function assessDeviceCapability(spec: {
  /** Device tier. */
  readonly tier: MobileDeviceTier;
  /** Available memory in bytes. */
  readonly memoryBytes: number;
  /** GPU model name. */
  readonly gpuModel: string;
  /** Screen resolution width. */
  readonly screenWidth: number;
  /** Screen resolution height. */
  readonly screenHeight: number;
  /** Caller-supplied on-device measurements; when present the FPS verdict is measured rather than estimated. */
  readonly measurements?: DeviceMeasurements;
}): DeviceCapability {
  const tier = spec.tier;
  let budget: MobilePerformanceBudget;

  switch (tier) {
    case 'low':
      budget = { ...DEFAULT_MOBILE_BUDGET, targetFps: 30, frameBudgetMs: 33.33, maxDrawCalls: 50, maxTrianglesPerFrame: 25000 };
      break;
    case 'mid':
      budget = { ...DEFAULT_MOBILE_BUDGET, targetFps: 30, frameBudgetMs: 33.33, maxDrawCalls: 100, maxTrianglesPerFrame: 50000 };
      break;
    case 'high':
      budget = { ...DEFAULT_MOBILE_BUDGET, targetFps: 60, frameBudgetMs: 16.67, maxDrawCalls: 200, maxTrianglesPerFrame: 100000 };
      break;
    case 'flagship':
      budget = { ...DEFAULT_MOBILE_BUDGET, targetFps: 60, frameBudgetMs: 16.67, maxDrawCalls: 400, maxTrianglesPerFrame: 200000 };
      break;
  }

  const features: string[] = [];
  const gpuLower = spec.gpuModel.toLowerCase();
  if (gpuLower.includes('adreno') || gpuLower.includes('mali') || gpuLower.includes('powervr')) {
    features.push('mobile-gpu');
  }
  if (spec.screenWidth * spec.screenHeight >= 1920 * 1080) {
    features.push('high-resolution');
  }

  let canMeetTargetFps: boolean;
  let basis: ResultBasis;
  let measuredEnvironment: string | undefined;

  if (spec.measurements !== undefined) {
    requireValidMeasurement(spec.measurements.sustainedFps, 'measured sustainedFps');
    requireIdentifiedEnvironment(spec.measurements.environment);
    canMeetTargetFps = spec.measurements.sustainedFps >= budget.targetFps;
    basis = 'measured';
    measuredEnvironment = spec.measurements.environment;
  } else {
    canMeetTargetFps = spec.memoryBytes >= budget.totalMemoryBytes;
    basis = 'estimate';
  }

  return {
    tier,
    features,
    recommendedBudget: budget,
    canMeetTargetFps,
    basis,
    ...(measuredEnvironment !== undefined ? { measuredEnvironment } : {}),
  };
}

/** Caller-supplied measurement for {@link estimateAssetMemory}. */
export interface AssetMemoryMeasurement {
  /** Asset memory footprint in bytes observed on a real device. */
  readonly measuredMemoryBytes: number;
}

/** Asset memory estimate. */
export interface AssetMemoryEstimate {
  /** Asset path. */
  readonly path: string;
  /**
   * Memory usage in bytes for the basis reported in
   * {@link AssetMemoryEstimate.basis}: the measured value when measured,
   * otherwise the model estimate.
   */
  readonly estimatedMemoryBytes: number;
  /** Whether the memory usage exceeds budget. */
  readonly exceedsBudget: boolean;
  /** Optimization suggestions derived from the effective memory usage. */
  readonly suggestions: readonly string[];
  /** How {@link AssetMemoryEstimate.estimatedMemoryBytes} was obtained. */
  readonly basis: ResultBasis;
}

/**
 * Estimate memory usage for an asset, or report a caller-supplied
 * measurement of it. Estimates come from per-type expansion factors and are
 * not measurements; a real memory figure must arrive through `measurements`.
 *
 * @param assetPath - asset file path used to infer the asset type.
 * @param assetSizeBytes - asset file size in bytes.
 * @param budget - performance budget supplying the texture memory limit.
 * @param measurements - optional measured memory footprint; when present it replaces the estimate for every derived comparison and suggestion.
 * @returns result with the memory usage, the budget comparison, optimization suggestions, and the basis of the memory usage.
 */
export function estimateAssetMemory(
  assetPath: string,
  assetSizeBytes: number,
  budget: MobilePerformanceBudget,
  measurements?: AssetMemoryMeasurement,
): AssetMemoryEstimate {
  const type = inferAssetType(assetPath);
  let estimatedBytes = assetSizeBytes;
  const suggestions: string[] = [];

  // Estimated memory is typically larger than file size due to decompression
  switch (type) {
    case 'texture':
      estimatedBytes = assetSizeBytes * 4; // uncompressed RGBA
      break;
    case 'model':
      estimatedBytes = assetSizeBytes * 2; // vertex data
      break;
    case 'audio':
      estimatedBytes = assetSizeBytes * 2; // decompressed PCM
      break;
    case 'animation':
      estimatedBytes = assetSizeBytes * 1.5;
      break;
    default:
      estimatedBytes = assetSizeBytes;
  }

  let memoryBytes: number;
  let basis: ResultBasis;
  if (measurements !== undefined) {
    requireValidMeasurement(measurements.measuredMemoryBytes, 'measuredMemoryBytes');
    memoryBytes = measurements.measuredMemoryBytes;
    basis = 'measured';
  } else {
    memoryBytes = estimatedBytes;
    basis = 'estimate';
  }

  if (type === 'texture' && memoryBytes > 4 * 1024 * 1024) {
    suggestions.push('Consider compressing texture or reducing resolution');
  }
  if (type === 'model' && memoryBytes > 2 * 1024 * 1024) {
    suggestions.push('Consider reducing polygon count');
  }
  if (type === 'audio' && memoryBytes > 10 * 1024 * 1024) {
    suggestions.push('Consider streaming audio instead of loading fully');
  }

  const exceedsBudget = memoryBytes > budget.textureMemoryBytes;

  return {
    path: assetPath,
    estimatedMemoryBytes: memoryBytes,
    exceedsBudget,
    suggestions,
    basis,
  };
}

/** Caller-supplied measurement for {@link estimateTotalMemory}. */
export interface TotalMemoryMeasurement {
  /** Combined memory footprint of all assets observed on a real device. */
  readonly measuredTotalBytes: number;
}

/**
 * Estimate total memory usage for all assets, or report a caller-supplied
 * measurement of the combined total. The per-asset attribution in
 * `overBudgetAssets` always comes from the per-asset estimates, even when
 * the combined total is measured.
 *
 * @param assets - asset paths with their file sizes in bytes.
 * @param budget - performance budget supplying the total memory limit.
 * @param measurements - optional measured combined total; when present it replaces the estimated sum for the total and the budget comparison.
 * @returns result with the combined memory usage, the budget comparison, sorted over-budget asset paths, and the basis of the combined total.
 */
export function estimateTotalMemory(
  assets: readonly { readonly path: string; readonly sizeBytes: number }[],
  budget: MobilePerformanceBudget,
  measurements?: TotalMemoryMeasurement,
): {
  /** Combined memory usage in bytes for the reported basis: the measured value when measured, otherwise the sum of per-asset estimates. */
  readonly totalEstimatedBytes: number;
  /** Whether the combined memory usage exceeds the budget. */
  readonly exceedsBudget: boolean;
  /** Paths of assets whose per-asset estimate exceeds the texture budget, sorted by path. Always estimate-based, even when the total is measured. */
  readonly overBudgetAssets: readonly string[];
  /** How the combined total was obtained. */
  readonly basis: ResultBasis;
} {
  let total = 0;
  const overBudget: string[] = [];

  for (const asset of assets) {
    const estimate = estimateAssetMemory(asset.path, asset.sizeBytes, budget);
    total += estimate.estimatedMemoryBytes;
    if (estimate.exceedsBudget) {
      overBudget.push(asset.path);
    }
  }

  let totalBytes: number;
  let basis: ResultBasis;
  if (measurements !== undefined) {
    requireValidMeasurement(measurements.measuredTotalBytes, 'measuredTotalBytes');
    totalBytes = measurements.measuredTotalBytes;
    basis = 'measured';
  } else {
    totalBytes = total;
    basis = 'estimate';
  }

  return {
    totalEstimatedBytes: totalBytes,
    exceedsBudget: totalBytes > budget.totalMemoryBytes,
    overBudgetAssets: overBudget.sort(),
    basis,
  };
}

/** Infer asset type from file path. */
function inferAssetType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.tga') || lower.endsWith('.bmp')) return 'texture';
  if (lower.endsWith('.fbx') || lower.endsWith('.obj') || lower.endsWith('.blend') || lower.endsWith('.dae')) return 'model';
  if (lower.endsWith('.anim') || lower.endsWith('.fbx') && lower.includes('anim')) return 'animation';
  if (lower.endsWith('.wav') || lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.aac')) return 'audio';
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) return 'font';
  if (lower.endsWith('.unity') || lower.endsWith('.tscn')) return 'scene';
  if (lower.endsWith('.prefab')) return 'prefab';
  if (lower.endsWith('.cs') || lower.endsWith('.js') || lower.endsWith('.gd')) return 'script';
  return 'other';
}

/** Caller-supplied on-device measurement for {@link estimateFrameTime}. */
export interface FrameTimeMeasurement {
  /** Frame time in milliseconds observed on a real device. */
  readonly measuredFrameTimeMs: number;
  /** Description of the device, build, and scene the frame time was measured on. Frame-rate claims must report this alongside the result. */
  readonly environment: string;
}

/**
 * Estimate frame time for a draw call count, or report a caller-supplied
 * on-device measurement. Without measurements the frame time is a rough
 * model output and must not be quoted as an achieved frame rate; a
 * frame-rate claim requires a measured frame time together with the
 * environment it was taken on, which the result then reports.
 *
 * @param drawCalls - draw calls per frame.
 * @param triangles - triangles rendered per frame.
 * @param budget - performance budget supplying the frame time limit.
 * @param measurements - optional on-device frame time measurement with its environment; when present it replaces the estimate.
 * @returns result with the frame time, the budget comparison, the basis, the measurement environment when measured, and the dominant bottleneck; a measured total cannot be attributed to a component, so its bottleneck is always `'none'`.
 */
export function estimateFrameTime(
  drawCalls: number,
  triangles: number,
  budget: MobilePerformanceBudget,
  measurements?: FrameTimeMeasurement,
): {
  /** Frame time in milliseconds for the reported basis: the measured value when measured, otherwise the model estimate. */
  readonly estimatedFrameTimeMs: number;
  /** Whether the frame time exceeds the budget. */
  readonly exceedsBudget: boolean;
  /** Dominant bottleneck, attributed only by the estimate; `'none'` for measured results. */
  readonly bottleneck: 'draw-calls' | 'triangles' | 'none';
  /** How the frame time was obtained. */
  readonly basis: ResultBasis;
  /**
   * Environment the measured frame time was taken on. Present exactly when
   * the basis is `'measured'`.
   */
  readonly measuredEnvironment?: string;
} {
  let frameTimeMs: number;
  let bottleneck: 'draw-calls' | 'triangles' | 'none' = 'none';
  let basis: ResultBasis;
  let measuredEnvironment: string | undefined;

  if (measurements !== undefined) {
    requireValidMeasurement(measurements.measuredFrameTimeMs, 'measuredFrameTimeMs');
    requireIdentifiedEnvironment(measurements.environment);
    frameTimeMs = measurements.measuredFrameTimeMs;
    basis = 'measured';
    measuredEnvironment = measurements.environment;
  } else {
    // Rough estimate: 0.05ms per draw call, 0.0001ms per triangle
    const drawCallTime = drawCalls * 0.05;
    const triangleTime = triangles * 0.0001;
    frameTimeMs = Math.max(drawCallTime, triangleTime);

    if (drawCallTime > triangleTime && drawCallTime > budget.frameBudgetMs * 0.5) {
      bottleneck = 'draw-calls';
    } else if (triangleTime > drawCallTime && triangleTime > budget.frameBudgetMs * 0.5) {
      bottleneck = 'triangles';
    }
    basis = 'estimate';
  }

  return {
    estimatedFrameTimeMs: frameTimeMs,
    exceedsBudget: frameTimeMs > budget.frameBudgetMs,
    bottleneck,
    basis,
    ...(measuredEnvironment !== undefined ? { measuredEnvironment } : {}),
  };
}
