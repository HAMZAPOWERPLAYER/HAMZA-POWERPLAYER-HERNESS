import { describe, expect, it } from 'vitest'
import { HernesProjectService } from '../src/index.ts'

describe('HernesProjectService', () => {
  it('detects project kinds', () => {
    const svc = new HernesProjectService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableDetection: true, ignorePatterns: [] },
    )
    const kinds = svc.detectProjects(['package.json', 'tsconfig.json'])
    expect(kinds).toContain('node')
  })

  it('summarizes workspace', () => {
    const svc = new HernesProjectService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableDetection: true, ignorePatterns: [] },
    )
    const summary = svc.summarizeWorkspace(['src/a.ts', 'src/b.ts', 'tests/a.spec.ts'])
    expect(summary.fileCount).toBe(3)
  })
})
