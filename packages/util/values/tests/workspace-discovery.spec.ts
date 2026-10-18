import { describe, expect, it } from 'vitest'
import { isMultiStack, summarizeWorkspace } from '../src/index.ts'

describe('summarizeWorkspace', () => {
  it('summarizes an empty workspace', () => {
    const s = summarizeWorkspace([])
    expect(s.primaryKind).toBe('unknown')
    expect(s.projectKinds).toEqual([])
    expect(s.hasTests).toBe(false)
    expect(s.hasCi).toBe(false)
    expect(s.hasDocs).toBe(false)
    expect(s.fileCount).toBe(0)
  })

  it('detects kinds and infrastructure', () => {
    const s = summarizeWorkspace([
      'package.json',
      'pubspec.yaml',
      '.github/workflows/ci.yml',
      'docs/guide.txt',
      'tests/foo.spec.ts',
    ])
    expect(s.projectKinds).toEqual(['flutter', 'node'])
    expect(s.primaryKind).toBe('flutter')
    expect(s.hasTests).toBe(true)
    expect(s.hasCi).toBe(true)
    expect(s.hasDocs).toBe(true)
    expect(s.fileCount).toBe(5)
  })

  it('normalizes backslashes', () => {
    const s = summarizeWorkspace(['.github\\workflows\\ci.yml', 'src\\foo.test.ts'])
    expect(s.hasCi).toBe(true)
    expect(s.hasTests).toBe(true)
  })

  it('detects .test.tsx and jenkinsfile', () => {
    const s = summarizeWorkspace(['src/a.test.tsx', 'Jenkinsfile'])
    expect(s.hasTests).toBe(true)
    expect(s.hasCi).toBe(true)
  })

  it('treats a workspace-root docs directory as documentation', () => {
    const s = summarizeWorkspace(['docs/guide.txt', 'src/a.ts'])
    expect(s.hasDocs).toBe(true)
    expect(summarizeWorkspace(['src/docs-adjacent/a.txt']).hasDocs).toBe(false)
  })
})

describe('isMultiStack', () => {
  it('true for several kinds', () => {
    expect(isMultiStack(summarizeWorkspace(['package.json', 'project.godot']))).toBe(true)
  })
  it('false for one kind', () => {
    expect(isMultiStack(summarizeWorkspace(['package.json']))).toBe(false)
  })
})
