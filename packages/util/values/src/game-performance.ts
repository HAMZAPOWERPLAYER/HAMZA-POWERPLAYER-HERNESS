/**
 * Game performance profiling model.
 *
 * Provides performance metrics collection, bottleneck detection, and
 * optimization recommendations for game projects. All helpers are pure: they
 * compute metrics from caller-supplied measurements, perform no I/O, and hold
 * no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-performance
 */

/** One performance sample. */
export interface PerformanceSample {
  /** Timestamp in milliseconds. */
  readonly timestamp: number;
  /** Frame time in milliseconds. */
  readonly frameTimeMs: number;
  /** CPU usage percentage (0 to 100). */
  readonly cpuUsagePercent: number;
  /** GPU usage percentage (0 to 100). */
  readonly gpuUsagePercent: number;
  /** Memory usage in bytes. */
  readonly memoryUsageBytes: number;
  /** Draw call count. */
  readonly drawCallCount: number;
  /** Triangle count. */
  readonly triangleCount: number;
}

/** Performance profile summary. */
export interface PerformanceProfile {
  /** Total samples. */
  readonly sampleCount: number;
  /** Average frame time in milliseconds. */
  readonly averageFrameTimeMs: number;
  /** Maximum frame time in milliseconds. */
  readonly maxFrameTimeMs: number;
  /** Minimum frame time in milliseconds. */
  readonly minFrameTimeMs: number;
  /** Average CPU usage percentage. */
  readonly averageCpuUsagePercent: number;
  /** Average GPU usage percentage. */
  readonly averageGpuUsagePercent: number;
  /** Average memory usage in bytes. */
  readonly averageMemoryUsageBytes: number;
  /** Peak memory usage in bytes. */
  readonly peakMemoryUsageBytes: number;
  /** Average draw call count. */
  readonly averageDrawCallCount: number;
  /** Average triangle count. */
  readonly averageTriangleCount: number;
  /** Frame times below 16.67ms (60 FPS). */
  readonly framesBelow60Fps: number;
  /** Frame times below 33.33ms (30 FPS). */
  readonly framesBelow30Fps: number;
}

/** Performance bottleneck. */
export interface PerformanceBottleneck {
  /** Bottleneck type. */
  readonly type: 'cpu' | 'gpu' | 'memory' | 'draw-calls' | 'triangles';
  /** Severity. */
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  /** Description. */
  readonly description: string;
  /** Suggested optimization. */
  readonly suggestion: string;
}

/**
 * Analyze performance samples.
 *
 * @param samples - recorded performance samples; an empty list yields an empty profile.
 * @param targetFps - target frame rate used to detect frame-time bottlenecks.
 * @returns a profile summary and the detected bottlenecks.
 */
export function analyzePerformance(
  samples: readonly PerformanceSample[],
  targetFps: number,
): {
  readonly profile: PerformanceProfile;
  readonly bottlenecks: readonly PerformanceBottleneck[];
} {
  if (samples.length === 0) {
    const emptyProfile: PerformanceProfile = {
      sampleCount: 0,
      averageFrameTimeMs: 0,
      maxFrameTimeMs: 0,
      minFrameTimeMs: 0,
      averageCpuUsagePercent: 0,
      averageGpuUsagePercent: 0,
      averageMemoryUsageBytes: 0,
      peakMemoryUsageBytes: 0,
      averageDrawCallCount: 0,
      averageTriangleCount: 0,
      framesBelow60Fps: 0,
      framesBelow30Fps: 0,
    };
    return { profile: emptyProfile, bottlenecks: [] };
  }

  const frameTimes = samples.map((s) => s.frameTimeMs);
  const cpuUsages = samples.map((s) => s.cpuUsagePercent);
  const gpuUsages = samples.map((s) => s.gpuUsagePercent);
  const memoryUsages = samples.map((s) => s.memoryUsageBytes);
  const drawCallCounts = samples.map((s) => s.drawCallCount);
  const triangleCounts = samples.map((s) => s.triangleCount);

  const averageFrameTimeMs = frameTimes.reduce((sum, v) => sum + v, 0) / frameTimes.length;
  const maxFrameTimeMs = Math.max(...frameTimes);
  const minFrameTimeMs = Math.min(...frameTimes);
  const averageCpuUsagePercent = cpuUsages.reduce((sum, v) => sum + v, 0) / cpuUsages.length;
  const averageGpuUsagePercent = gpuUsages.reduce((sum, v) => sum + v, 0) / gpuUsages.length;
  const averageMemoryUsageBytes = memoryUsages.reduce((sum, v) => sum + v, 0) / memoryUsages.length;
  const peakMemoryUsageBytes = Math.max(...memoryUsages);
  const averageDrawCallCount = drawCallCounts.reduce((sum, v) => sum + v, 0) / drawCallCounts.length;
  const averageTriangleCount = triangleCounts.reduce((sum, v) => sum + v, 0) / triangleCounts.length;

  const targetFrameTimeMs = 1000 / targetFps;
  const framesBelow60Fps = frameTimes.filter((ft) => ft <= 1000 / 60).length;
  const framesBelow30Fps = frameTimes.filter((ft) => ft <= 1000 / 30).length;

  const profile: PerformanceProfile = {
    sampleCount: samples.length,
    averageFrameTimeMs,
    maxFrameTimeMs,
    minFrameTimeMs,
    averageCpuUsagePercent,
    averageGpuUsagePercent,
    averageMemoryUsageBytes,
    peakMemoryUsageBytes,
    averageDrawCallCount,
    averageTriangleCount,
    framesBelow60Fps,
    framesBelow30Fps,
  };

  const bottlenecks: PerformanceBottleneck[] = [];

  if (averageFrameTimeMs > targetFrameTimeMs * 1.5) {
    bottlenecks.push({
      type: 'cpu',
      severity: 'high',
      description: `Average frame time ${averageFrameTimeMs.toFixed(2)}ms exceeds target ${targetFrameTimeMs.toFixed(2)}ms`,
      suggestion: 'Optimize update loops and reduce per-frame computation',
    });
  }

  if (averageCpuUsagePercent > 90) {
    bottlenecks.push({
      type: 'cpu',
      severity: 'high',
      description: `CPU usage at ${averageCpuUsagePercent.toFixed(1)}%`,
      suggestion: 'Profile CPU-intensive systems and reduce per-frame work',
    });
  }

  if (averageGpuUsagePercent > 90) {
    bottlenecks.push({
      type: 'gpu',
      severity: 'high',
      description: `GPU usage at ${averageGpuUsagePercent.toFixed(1)}%`,
      suggestion: 'Optimize shaders, reduce draw calls, and lower texture quality',
    });
  }

  if (averageDrawCallCount > 200) {
    bottlenecks.push({
      type: 'draw-calls',
      severity: 'medium',
      description: `Average draw calls ${averageDrawCallCount.toFixed(0)} per frame is high`,
      suggestion: 'Batch draw calls and use GPU instancing',
    });
  }

  if (averageTriangleCount > 100000) {
    bottlenecks.push({
      type: 'triangles',
      severity: 'medium',
      description: `Average triangle count ${averageTriangleCount.toFixed(0)} per frame is high`,
      suggestion: 'Reduce polygon count and use LOD models',
    });
  }

  if (peakMemoryUsageBytes > 512 * 1024 * 1024) {
    bottlenecks.push({
      type: 'memory',
      severity: 'high',
      description: `Peak memory usage ${(peakMemoryUsageBytes / (1024 * 1024)).toFixed(1)}MB is high`,
      suggestion: 'Optimize asset sizes and unload unused resources',
    });
  }

  return { profile, bottlenecks };
}

/**
 * Compare two performance profiles.
 *
 * @param before - profile recorded before the change.
 * @param after - profile recorded after the change.
 * @returns percentage changes for frame time, CPU, GPU, and memory, plus whether frame time improved.
 */
export function comparePerformanceProfiles(
  before: PerformanceProfile,
  after: PerformanceProfile,
): {
  readonly frameTimeChangePercent: number;
  readonly cpuChangePercent: number;
  readonly gpuChangePercent: number;
  readonly memoryChangePercent: number;
  readonly improvement: boolean;
} {
  const frameTimeChangePercent = before.averageFrameTimeMs === 0
    ? 0
    : ((after.averageFrameTimeMs - before.averageFrameTimeMs) / before.averageFrameTimeMs) * 100;
  const cpuChangePercent = before.averageCpuUsagePercent === 0
    ? 0
    : ((after.averageCpuUsagePercent - before.averageCpuUsagePercent) / before.averageCpuUsagePercent) * 100;
  const gpuChangePercent = before.averageGpuUsagePercent === 0
    ? 0
    : ((after.averageGpuUsagePercent - before.averageGpuUsagePercent) / before.averageGpuUsagePercent) * 100;
  const memoryChangePercent = before.averageMemoryUsageBytes === 0
    ? 0
    : ((after.averageMemoryUsageBytes - before.averageMemoryUsageBytes) / before.averageMemoryUsageBytes) * 100;

  const improvement = after.averageFrameTimeMs < before.averageFrameTimeMs;

  return { frameTimeChangePercent, cpuChangePercent, gpuChangePercent, memoryChangePercent, improvement };
}

/**
 * Format performance profile as a summary string.
 *
 * @param profile - performance profile to format.
 * @returns a multi-line summary of the profile's metrics.
 */
export function formatPerformanceProfile(profile: PerformanceProfile): string {
  return `
Performance Profile:
  Samples: ${profile.sampleCount}
  Average Frame Time: ${profile.averageFrameTimeMs.toFixed(2)}ms (${(1000 / profile.averageFrameTimeMs).toFixed(1)} FPS)
  Max Frame Time: ${profile.maxFrameTimeMs.toFixed(2)}ms
  Min Frame Time: ${profile.minFrameTimeMs.toFixed(2)}ms
  Average CPU: ${profile.averageCpuUsagePercent.toFixed(1)}%
  Average GPU: ${profile.averageGpuUsagePercent.toFixed(1)}%
  Average Memory: ${(profile.averageMemoryUsageBytes / (1024 * 1024)).toFixed(2)}MB
  Peak Memory: ${(profile.peakMemoryUsageBytes / (1024 * 1024)).toFixed(2)}MB
  Average Draw Calls: ${profile.averageDrawCallCount.toFixed(0)}
  Average Triangles: ${profile.averageTriangleCount.toFixed(0)}
  Frames <= 60 FPS: ${profile.framesBelow60Fps} (${((profile.framesBelow60Fps / profile.sampleCount) * 100).toFixed(1)}%)
  Frames <= 30 FPS: ${profile.framesBelow30Fps} (${((profile.framesBelow30Fps / profile.sampleCount) * 100).toFixed(1)}%)
`.trim();
}
