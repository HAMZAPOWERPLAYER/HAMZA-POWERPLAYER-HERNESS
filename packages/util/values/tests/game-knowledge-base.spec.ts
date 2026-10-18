import { describe, expect, it } from 'vitest'
import {
  addEntry,
  createKnowledgeBase,
  createKnowledgeBaseEntry,
  getEntriesByFile,
  getEntriesByTag,
  getEntriesByType,
  removeEntry,
  resolveSourcePrecedence,
  searchKnowledgeBase,
  summarizeKnowledgeBase,
  updateEntry,
  validateKnowledgeBaseEntry,
} from '../src/game-knowledge-base.ts'

function makeEntry(
  id: string,
  overrides: {
    type?: 'architecture' | 'engine-note' | 'resolved-bug' | 'convention' | 'performance-note' | 'security-note'
    title?: string
    content?: string
    tags?: readonly string[]
    relatedFiles?: readonly string[]
    version?: string | null
    sourceVersion?: string
    createdAt?: number
    updatedAt?: number
    confidence?: number
  } = {},
) {
  const entry = createKnowledgeBaseEntry({
    id,
    type: overrides.type ?? 'architecture',
    title: overrides.title ?? `Title ${id}`,
    content: overrides.content ?? `Content ${id}`,
    tags: overrides.tags ?? [],
    relatedFiles: overrides.relatedFiles ?? [],
    version: overrides.version ?? null,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    confidence: overrides.confidence ?? 1,
  })
  return overrides.sourceVersion === undefined ? entry : { ...entry, sourceVersion: overrides.sourceVersion }
}

function makeKb(entries: ReturnType<typeof makeEntry>[] = []) {
  return createKnowledgeBase({ entries, version: 'v1' })
}

describe('createKnowledgeBaseEntry', () => {
  it('materializes every provided field', () => {
    const entry = createKnowledgeBaseEntry({
      id: 'kb-1',
      type: 'resolved-bug',
      title: 'Crash on save',
      content: 'Null dereference in the serializer',
      tags: ['save', 'crash'],
      relatedFiles: ['src/save.ts'],
      version: '1.2.0',
      createdAt: 1000,
      updatedAt: 2000,
      confidence: 0.8,
    })
    expect(entry).toEqual({
      id: 'kb-1',
      type: 'resolved-bug',
      title: 'Crash on save',
      content: 'Null dereference in the serializer',
      tags: ['save', 'crash'],
      relatedFiles: ['src/save.ts'],
      version: '1.2.0',
      createdAt: 1000,
      updatedAt: 2000,
      confidence: 0.8,
    })
  })

  it('keeps a null version as null', () => {
    expect(makeEntry('kb-2').version).toBeNull()
  })

  it('records a provided source version', () => {
    const entry = createKnowledgeBaseEntry({
      id: 'kb-3',
      type: 'engine-note',
      title: 'Renderer note',
      content: 'Vulkan backend details',
      tags: [],
      relatedFiles: [],
      version: '1.0.0',
      sourceVersion: '1.4.2',
      createdAt: 0,
      updatedAt: 0,
      confidence: 1,
    })
    expect(entry.sourceVersion).toBe('1.4.2')
  })

  it('omits the source version when not provided', () => {
    expect(makeEntry('kb-4')).not.toHaveProperty('sourceVersion')
  })
})

describe('createKnowledgeBase', () => {
  it('preserves the entries and version', () => {
    const entry = makeEntry('kb-1')
    const kb = createKnowledgeBase({ entries: [entry], version: '2.0.0' })
    expect(kb.entries).toEqual([entry])
    expect(kb.version).toBe('2.0.0')
  })
})

describe('addEntry', () => {
  it('appends the entry and preserves the version', () => {
    const first = makeEntry('kb-1')
    const second = makeEntry('kb-2')
    const kb = addEntry(makeKb([first]), second)
    expect(kb.entries).toHaveLength(2)
    expect(kb.entries).toContainEqual(first)
    expect(kb.entries).toContainEqual(second)
    expect(kb.version).toBe('v1')
  })

  it('does not mutate the original knowledge base', () => {
    const kb = makeKb([])
    addEntry(kb, makeEntry('kb-1'))
    expect(kb.entries).toHaveLength(0)
  })
})

describe('updateEntry', () => {
  it('applies the given updates and preserves untouched fields', () => {
    const kb = makeKb([
      makeEntry('kb-1', {
        title: 'Old title',
        content: 'Original body',
        tags: ['physics'],
        version: '1.0.0',
        createdAt: 1000,
        confidence: 0.5,
      }),
    ])
    const entry = updateEntry(kb, 'kb-1', { title: 'New title', confidence: 0.9 }).entries[0]!
    expect(entry.title).toBe('New title')
    expect(entry.confidence).toBe(0.9)
    expect(entry.content).toBe('Original body')
    expect(entry.tags).toEqual(['physics'])
    expect(entry.version).toBe('1.0.0')
    expect(entry.createdAt).toBe(1000)
    expect(entry.updatedAt).toBeGreaterThan(0)
  })

  it('can clear the version to null', () => {
    const kb = makeKb([makeEntry('kb-1', { version: '1.0.0' })])
    expect(updateEntry(kb, 'kb-1', { version: null }).entries[0]!.version).toBeNull()
  })

  it('preserves a recorded source version across updates', () => {
    const kb = makeKb([makeEntry('kb-1', { sourceVersion: '1.0.0' })])
    const entry = updateEntry(kb, 'kb-1', { title: 'Changed' }).entries[0]!
    expect(entry.title).toBe('Changed')
    expect(entry.sourceVersion).toBe('1.0.0')
  })

  it('leaves other entries unchanged', () => {
    const second = makeEntry('kb-2', { title: 'Second' })
    const kb = makeKb([makeEntry('kb-1'), second])
    const updated = updateEntry(kb, 'kb-1', { title: 'Changed' })
    expect(updated.entries[1]).toEqual(second)
    expect(updated.version).toBe('v1')
  })

  it('throws for an unknown entry id', () => {
    expect(() => updateEntry(makeKb([]), 'missing', { title: 'x' })).toThrow(
      /unknown knowledge base entry: missing/,
    )
  })
})

describe('removeEntry', () => {
  it('removes only the matching entry', () => {
    const kb = makeKb([makeEntry('kb-1'), makeEntry('kb-2')])
    const result = removeEntry(kb, 'kb-1')
    expect(result.entries.map((e) => e.id)).toEqual(['kb-2'])
    expect(result.version).toBe('v1')
  })

  it('returns an equivalent knowledge base for an unknown id', () => {
    const kb = makeKb([makeEntry('kb-1')])
    expect(removeEntry(kb, 'missing')).toEqual(kb)
  })
})

describe('searchKnowledgeBase', () => {
  function fixture() {
    return makeKb([
      makeEntry('kb-1', {
        title: 'Physics Engine Notes',
        content: 'The Bullet physics integration',
        tags: ['physics', 'engine'],
      }),
      makeEntry('kb-2', {
        title: 'Input Handling',
        content: 'Buffered keyboard input',
        tags: ['input'],
      }),
      makeEntry('kb-3', {
        title: 'Rendering Pipeline',
        content: 'Vulkan backend',
        tags: ['rendering', 'engine'],
      }),
    ])
  }

  it('matches title, content, and tags case-insensitively', () => {
    const kb = fixture()
    expect(searchKnowledgeBase(kb, 'PHYSIC').map((e) => e.id)).toEqual(['kb-1'])
    expect(searchKnowledgeBase(kb, 'bullet').map((e) => e.id)).toEqual(['kb-1'])
    expect(searchKnowledgeBase(kb, 'keyboard').map((e) => e.id)).toEqual(['kb-2'])
    expect(searchKnowledgeBase(kb, 'RENDERING').map((e) => e.id)).toEqual(['kb-3'])
  })

  it('returns matches in knowledge base order', () => {
    expect(searchKnowledgeBase(fixture(), 'engine').map((e) => e.id)).toEqual(['kb-1', 'kb-3'])
  })

  it('returns nothing for a query with no matches', () => {
    expect(searchKnowledgeBase(fixture(), 'quantum')).toHaveLength(0)
  })

  it('an empty query matches every entry', () => {
    expect(searchKnowledgeBase(fixture(), '')).toHaveLength(3)
  })
})

describe('getEntriesByType', () => {
  function fixture() {
    return makeKb([
      makeEntry('kb-1', { type: 'architecture' }),
      makeEntry('kb-2', { type: 'resolved-bug' }),
      makeEntry('kb-3', { type: 'architecture' }),
    ])
  }

  it('returns only entries of the requested type in order', () => {
    expect(getEntriesByType(fixture(), 'architecture').map((e) => e.id)).toEqual(['kb-1', 'kb-3'])
  })

  it('returns nothing when the type is absent', () => {
    expect(getEntriesByType(fixture(), 'security-note')).toHaveLength(0)
  })
})

describe('getEntriesByTag', () => {
  function fixture() {
    return makeKb([
      makeEntry('kb-1', { tags: ['physics', 'engine'] }),
      makeEntry('kb-2', { tags: ['input'] }),
    ])
  }

  it('returns entries carrying the exact tag', () => {
    expect(getEntriesByTag(fixture(), 'physics').map((e) => e.id)).toEqual(['kb-1'])
  })

  it('does not match tag substrings', () => {
    expect(getEntriesByTag(fixture(), 'phys')).toHaveLength(0)
  })
})

describe('getEntriesByFile', () => {
  function fixture() {
    return makeKb([
      makeEntry('kb-1', { relatedFiles: ['src/a.ts'] }),
      makeEntry('kb-2', { relatedFiles: ['src/b.ts', 'src/a.ts'] }),
    ])
  }

  it('returns entries listing the exact file path', () => {
    expect(getEntriesByFile(fixture(), 'src/a.ts').map((e) => e.id)).toEqual(['kb-1', 'kb-2'])
  })

  it('returns nothing for an unrelated path', () => {
    expect(getEntriesByFile(fixture(), 'src/a')).toHaveLength(0)
  })
})

describe('resolveSourcePrecedence', () => {
  it('relies on an entry whose recorded source version matches the observed source', () => {
    const entry = makeEntry('kb-1', { sourceVersion: '2.1.0' })
    expect(resolveSourcePrecedence(entry, '2.1.0')).toBe('rely')
  })

  it('supersedes an entry whose recorded source version is behind the observed source', () => {
    const entry = makeEntry('kb-1', { sourceVersion: '2.0.0' })
    expect(resolveSourcePrecedence(entry, '2.1.0')).toBe('superseded-by-source')
  })

  it('ranks a generated note without a recorded source version as unverified', () => {
    const entry = makeEntry('kb-1')
    expect(resolveSourcePrecedence(entry, '2.1.0')).toBe('unverified')
  })

  it('ranks comparison unverified when no source version was observed', () => {
    const entry = makeEntry('kb-1', { sourceVersion: '2.0.0' })
    expect(resolveSourcePrecedence(entry, null)).toBe('unverified')
  })

  it('never ranks a conflicting entry above the source', () => {
    const entry = makeEntry('kb-1', { sourceVersion: '1.9.0', confidence: 1 })
    const precedence = resolveSourcePrecedence(entry, '2.0.0')
    expect(precedence).not.toBe('rely')
    expect(precedence).toBe('superseded-by-source')
  })
})

describe('summarizeKnowledgeBase', () => {
  it('summarizes an empty knowledge base to zeros', () => {
    const summary = summarizeKnowledgeBase(makeKb([]))
    expect(summary).toEqual({
      totalEntries: 0,
      entriesByType: [],
      averageConfidence: 0,
      lowConfidenceEntries: [],
    })
  })

  it('counts types in first-seen order and averages confidence', () => {
    const kb = makeKb([
      makeEntry('kb-1', { type: 'architecture', confidence: 1 }),
      makeEntry('kb-2', { type: 'architecture', confidence: 0.5 }),
      makeEntry('kb-3', { type: 'resolved-bug', confidence: 0.25 }),
      makeEntry('kb-4', { type: 'engine-note', confidence: 0.25 }),
    ])
    expect(summarizeKnowledgeBase(kb)).toEqual({
      totalEntries: 4,
      entriesByType: [
        { type: 'architecture', count: 2 },
        { type: 'resolved-bug', count: 1 },
        { type: 'engine-note', count: 1 },
      ],
      averageConfidence: 0.5,
      lowConfidenceEntries: ['kb-3', 'kb-4'],
    })
  })
})

describe('validateKnowledgeBaseEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(validateKnowledgeBaseEntry(makeEntry('kb-1'))).toHaveLength(0)
  })

  it('accepts confidence exactly at the 0 and 1 boundaries', () => {
    expect(validateKnowledgeBaseEntry(makeEntry('kb-1', { confidence: 0 }))).toHaveLength(0)
    expect(validateKnowledgeBaseEntry(makeEntry('kb-2', { confidence: 1 }))).toHaveLength(0)
  })

  it('reports every violation at once', () => {
    const entry = makeEntry('   ', {
      title: ' ',
      content: ' \n ',
      confidence: 1.2,
    })
    const problems = validateKnowledgeBaseEntry(entry)
    expect(problems).toHaveLength(4)
    expect(problems).toContain('id must not be empty')
    expect(problems).toContain('title must not be empty')
    expect(problems).toContain('content must not be empty')
    expect(problems).toContain('confidence must be between 0 and 1')
  })

  it('flags confidence below zero', () => {
    const problems = validateKnowledgeBaseEntry(makeEntry('kb-1', { confidence: -0.01 }))
    expect(problems).toEqual(['confidence must be between 0 and 1'])
  })

  it('names an api-key credential in content without echoing the secret', () => {
    const secret = 'sk-3Zq7xLm9Wv2Tb8Hc4Rd6Nf1Ys5Kj0Pa'
    const problems = validateKnowledgeBaseEntry(
      makeEntry('kb-1', { content: `deploy token ${secret}` }),
    )
    expect(problems).toEqual([
      'content: credential of kind "api-key" detected; value redacted to [REDACTED]',
    ])
    expect(problems.join('\n')).not.toContain(secret)
  })

  it('names a password credential without echoing the value', () => {
    const secret = 'hunter2-not-a-real-password'
    const problems = validateKnowledgeBaseEntry(
      makeEntry('kb-1', { content: `DB_PASSWORD=${secret}` }),
    )
    expect(problems).toEqual([
      'content: credential of kind "password" detected; value redacted to [REDACTED]',
    ])
    expect(problems.join('\n')).not.toContain(secret)
  })

  it('names a bearer token credential found in tags without echoing the value', () => {
    const secret = 'abcdefghijklmnopqrstuv123456'
    const problems = validateKnowledgeBaseEntry(
      makeEntry('kb-1', { tags: ['auth', `Bearer ${secret}`] }),
    )
    expect(problems).toEqual([
      'tags: credential of kind "token" detected; value redacted to [REDACTED]',
    ])
    expect(problems.join('\n')).not.toContain(secret)
  })

  it('names a private key block without echoing key material', () => {
    const material = 'MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfnQ7'
    const problems = validateKnowledgeBaseEntry(
      makeEntry('kb-1', {
        content: `-----BEGIN RSA PRIVATE KEY-----\n${material}\n-----END RSA PRIVATE KEY-----`,
      }),
    )
    expect(problems).toEqual([
      'content: credential of kind "private-key" detected; value redacted to [REDACTED]',
    ])
    expect(problems.join('\n')).not.toContain(material)
  })

  it('reports each detected credential kind separately and redacts every value', () => {
    const apiKey = 'sk-9Qx2Lm7Tb4Hc6Rd8Nf1Ys5Kj3Pa0Zx'
    const password = 'hunter2-never-plain'
    const problems = validateKnowledgeBaseEntry(
      makeEntry('kb-1', { content: `DB_PASSWORD=${password}\ndeploy ${apiKey}` }),
    )
    expect(problems).toEqual([
      'content: credential of kind "password" detected; value redacted to [REDACTED]',
      'content: credential of kind "api-key" detected; value redacted to [REDACTED]',
    ])
    expect(problems.join('\n')).not.toContain(password)
    expect(problems.join('\n')).not.toContain(apiKey)
  })

  it('reports no credential for benign entries mentioning security topics', () => {
    const entry = makeEntry('kb-1', {
      title: 'Password rotation convention',
      content: 'Rotate passwords every 90 days; the token endpoint moved to src/auth.ts',
      tags: ['security', 'auth'],
    })
    expect(validateKnowledgeBaseEntry(entry)).toHaveLength(0)
  })
})
