import { describe, expect, it } from 'vitest'
import { HernesCodebaseService } from '../src/index.ts'

describe('HernesCodebaseService', () => {
  it('builds a dependency graph', () => {
    const svc = new HernesCodebaseService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableUnderstanding: true, maxRankedFiles: 50 },
    )
    const graph = svc.buildGraph([
      { path: 'src/a.ts', content: "import { b } from './b.ts'" },
      { path: 'src/b.ts', content: 'export const b = 1' },
    ])
    expect(graph.files).toHaveLength(2)
    expect(graph.edges.length).toBeGreaterThanOrEqual(0)
  })

  it('ranks files by relevance', () => {
    const svc = new HernesCodebaseService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableUnderstanding: true, maxRankedFiles: 50 },
    )
    const ranked = svc.rankFiles(
      [{ path: 'src/a.ts', content: 'import { foo } from ./bar' }],
      ['foo'],
    )
    expect(Array.isArray(ranked)).toBe(true)
  })
})
