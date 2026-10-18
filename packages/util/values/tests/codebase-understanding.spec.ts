import { describe, expect, it } from 'vitest'
import {
  buildDependencyGraph,
  findAffectedFiles,
  rankFilesByRelevance,
  type DependencyEdge,
  type DependencyGraph,
  type ObservedFile,
  type RankedFile,
} from '../src/codebase-understanding.ts'

function observed(path: string, content: string | null = 'content'): ObservedFile {
  return { path, content }
}

describe('buildDependencyGraph', () => {
  it('builds edges from import statements', () => {
    const files = [
      observed('a.ts', "import './b.ts'"),
      observed('b.ts', "import './c.ts'"),
      observed('c.ts', 'export default {}'),
    ]
    const graph = buildDependencyGraph(files)
    expect(graph.files).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(graph.edges).toEqual([
      { from: 'a.ts', to: 'b.ts' },
      { from: 'b.ts', to: 'c.ts' },
    ] as readonly DependencyEdge[])
  })

  it('resolves imports without extensions', () => {
    const files = [
      observed('a.ts', "import './b'"),
      observed('b.ts', 'export default {}'),
    ]
    const graph = buildDependencyGraph(files)
    expect(graph.edges).toEqual([{ from: 'a.ts', to: 'b.ts' }])
  })

  it('ignores imports to absent files', () => {
    const files = [observed('a.ts', "import './missing.ts'")]
    const graph = buildDependencyGraph(files)
    expect(graph.edges).toEqual([])
  })

  it('ignores null content', () => {
    const files = [observed('a.ts', null)]
    const graph = buildDependencyGraph(files)
    expect(graph.edges).toEqual([])
    expect(graph.files).toEqual(['a.ts'])
  })

  it('computes roots and leaves', () => {
    const files = [
      observed('a.ts', "import './b.ts'"),
      observed('b.ts', "import './c.ts'"),
      observed('c.ts', 'export default {}'),
    ]
    const graph = buildDependencyGraph(files)
    expect(graph.roots).toEqual(['a.ts'])
    expect(graph.leaves).toEqual(['c.ts'])
  })

  it('detects cyclic files', () => {
    const files = [
      observed('a.ts', "import './b.ts'"),
      observed('b.ts', "import './c.ts'"),
      observed('c.ts', "import './a.ts'"),
    ]
    const graph = buildDependencyGraph(files)
    expect(graph.cyclicFiles).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })

  it('returns empty graph for no files', () => {
    const graph = buildDependencyGraph([])
    expect(graph.files).toEqual([])
    expect(graph.edges).toEqual([])
    expect(graph.roots).toEqual([])
    expect(graph.leaves).toEqual([])
    expect(graph.cyclicFiles).toEqual([])
  })
})

describe('rankFilesByRelevance', () => {
  it('ranks files by term frequency', () => {
    const files = [
      observed('a.ts', 'auth login token'),
      observed('b.ts', 'auth login login'),
      observed('c.ts', 'unrelated'),
    ]
    const ranked = rankFilesByRelevance(files, ['login', 'auth'])
    expect(ranked).toHaveLength(2)
    expect(ranked[0].path).toBe('b.ts')
    expect(ranked[0].score).toBe(3)
    expect(ranked[1].path).toBe('a.ts')
    expect(ranked[1].score).toBe(2)
  })

  it('matches case-insensitively', () => {
    const files = [observed('a.ts', 'Login Token')]
    const ranked = rankFilesByRelevance(files, ['login'])
    expect(ranked).toHaveLength(1)
    expect(ranked[0].matchedTerms).toEqual(['login'])
  })

  it('returns an empty array when nothing matches', () => {
    const files = [observed('a.ts', 'unrelated')]
    expect(rankFilesByRelevance(files, ['login'])).toEqual([])
  })

  it('returns an empty array for no files', () => {
    expect(rankFilesByRelevance([], ['login'])).toEqual([])
  })
})

describe('findAffectedFiles', () => {
  it('returns direct dependents of a changed file', () => {
    const graph = buildDependencyGraph([
      observed('a.ts', "import './b.ts'"),
      observed('b.ts', "import './c.ts'"),
      observed('c.ts', 'export default {}'),
    ])
    const affected = findAffectedFiles(graph, 'c.ts')
    expect(affected.changedFile).toBe('c.ts')
    expect(affected.directDependents).toEqual(['b.ts'])
    expect(affected.transitiveDependents).toEqual(['a.ts', 'b.ts'])
  })

  it('returns empty when nothing depends on the file', () => {
    const graph = buildDependencyGraph([
      observed('a.ts', "import './b.ts'"),
      observed('b.ts', 'export default {}'),
    ])
    const affected = findAffectedFiles(graph, 'b.ts')
    expect(affected.directDependents).toEqual(['a.ts'])
    expect(affected.transitiveDependents).toEqual(['a.ts'])
  })

  it('handles a changed file with no dependents', () => {
    const graph = buildDependencyGraph([
      observed('a.ts', 'export default {}'),
      observed('b.ts', 'export default {}'),
    ])
    const affected = findAffectedFiles(graph, 'a.ts')
    expect(affected.directDependents).toEqual([])
    expect(affected.transitiveDependents).toEqual([])
  })
})
