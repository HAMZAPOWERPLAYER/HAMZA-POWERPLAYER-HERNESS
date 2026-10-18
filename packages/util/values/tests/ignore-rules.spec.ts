import { describe, expect, it } from 'vitest'
import { isIgnored, matchesIgnoreRule, parseIgnoreRule, parseIgnoreRules, type IgnoreRule } from '../src/ignore-rules.ts'

/** Parse a line the test expects to produce a rule, failing the setup when it does not. */
function requireRule(line: string): IgnoreRule {
  const rule = parseIgnoreRule(line)
  if (rule === null) throw new Error(`expected a rule from ${JSON.stringify(line)}`)
  return rule
}

describe('parseIgnoreRule', () => {
  it('returns null for blank lines', () => {
    expect(parseIgnoreRule('')).toBeNull()
    expect(parseIgnoreRule('   ')).toBeNull()
    expect(parseIgnoreRule('\t')).toBeNull()
  })

  it('returns null for comment lines', () => {
    expect(parseIgnoreRule('#')).toBeNull()
    expect(parseIgnoreRule('# a comment')).toBeNull()
  })

  it('trims trailing whitespace only', () => {
    expect(parseIgnoreRule('*.log   ')).toEqual({ pattern: '*.log', negated: false, directoryOnly: false })
    expect(parseIgnoreRule('  *.log')).toEqual({ pattern: '  *.log', negated: false, directoryOnly: false })
  })

  it('parses a plain pattern', () => {
    expect(parseIgnoreRule('*.log')).toEqual({ pattern: '*.log', negated: false, directoryOnly: false })
  })

  it('parses negation', () => {
    expect(parseIgnoreRule('!keep.log')).toEqual({ pattern: 'keep.log', negated: true, directoryOnly: false })
  })

  it('parses a directory-only pattern and strips the trailing slash', () => {
    expect(parseIgnoreRule('node_modules/')).toEqual({ pattern: 'node_modules', negated: false, directoryOnly: true })
    expect(parseIgnoreRule('node_modules//')).toEqual({ pattern: 'node_modules', negated: false, directoryOnly: true })
  })

  it('combines negation with a directory-only pattern', () => {
    expect(parseIgnoreRule('!build/')).toEqual({ pattern: 'build', negated: true, directoryOnly: true })
  })

  it('treats # as a comment only in the first column and keeps a leading !', () => {
    expect(parseIgnoreRule(' #not-a-comment')).toEqual({ pattern: ' #not-a-comment', negated: false, directoryOnly: false })
    expect(parseIgnoreRule('!#kept')).toEqual({ pattern: '#kept', negated: true, directoryOnly: false })
  })

  it('keeps a marker-only line as a rule whose empty pattern matches nothing', () => {
    const rule = requireRule('/')
    expect(rule).toEqual({ pattern: '', negated: false, directoryOnly: true })
    expect(matchesIgnoreRule(rule, 'anything', false)).toBe(false)
    expect(matchesIgnoreRule(rule, '', false)).toBe(false)
  })
})

describe('parseIgnoreRules', () => {
  it('drops blank and comment lines and keeps file order', () => {
    expect(parseIgnoreRules(['', '# note', '  ', '*.log', '!keep.log'])).toEqual([
      { pattern: '*.log', negated: false, directoryOnly: false },
      { pattern: 'keep.log', negated: true, directoryOnly: false },
    ])
  })

  it('returns an empty list when no line produces a rule', () => {
    expect(parseIgnoreRules([])).toEqual([])
    expect(parseIgnoreRules(['# only a comment', ''])).toEqual([])
  })
})

describe('matchesIgnoreRule', () => {
  it('matches a path segment exactly', () => {
    const rule = requireRule('build')
    expect(matchesIgnoreRule(rule, 'build', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'build', true)).toBe(true)
  })

  it('matches paths under a matching directory prefix', () => {
    const rule = requireRule('build')
    expect(matchesIgnoreRule(rule, 'build/output/app.js', false)).toBe(true)
  })

  it('matches nothing against an empty path', () => {
    expect(matchesIgnoreRule(requireRule('build'), '', false)).toBe(false)
  })

  it('anchors the pattern at the start of the path', () => {
    const rule = requireRule('build')
    expect(matchesIgnoreRule(rule, 'src/build', true)).toBe(false)
    expect(matchesIgnoreRule(rule, 'src/build/app.js', false)).toBe(false)
    expect(matchesIgnoreRule(rule, 'buildx', true)).toBe(false)
  })

  it('leaves the negation flag to isIgnored', () => {
    const rule = requireRule('!keep.log')
    expect(matchesIgnoreRule(rule, 'keep.log', false)).toBe(true)
  })

  it('matches * within one path segment', () => {
    const rule = requireRule('src/*.ts')
    expect(matchesIgnoreRule(rule, 'src/main.ts', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src/ignore-rules.ts', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src/nested/main.ts', false)).toBe(false)
    expect(matchesIgnoreRule(rule, 'src/main.ts.bak', false)).toBe(false)
  })

  it('matches a segment wildcard against a directory prefix', () => {
    const rule = requireRule('src/*')
    expect(matchesIgnoreRule(rule, 'src/dist', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src/dist/index.js', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src', false)).toBe(false)
  })

  it('matches ** at any depth', () => {
    const rule = requireRule('**/generated')
    expect(matchesIgnoreRule(rule, 'generated', true)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src/generated', true)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src/a/b/generated', true)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src/generated-file', false)).toBe(false)
  })

  it('matches a trailing ** against contents and the prefix directory itself', () => {
    const rule = requireRule('docs/**')
    expect(matchesIgnoreRule(rule, 'docs/readme.txt', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'docs/a/b.txt', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'docs', true)).toBe(true)
    expect(matchesIgnoreRule(rule, 'docsx/a.md', false)).toBe(false)
  })

  it('matches every path with a bare ** rule', () => {
    const rule = requireRule('**')
    expect(matchesIgnoreRule(rule, 'anything', true)).toBe(true)
    expect(matchesIgnoreRule(rule, 'a/b/c', false)).toBe(true)
  })

  it('matches a directory-only rule against a directory and its contents', () => {
    const rule = requireRule('build/')
    expect(matchesIgnoreRule(rule, 'build', true)).toBe(true)
    expect(matchesIgnoreRule(rule, 'build', false)).toBe(false)
    expect(matchesIgnoreRule(rule, 'build/app.js', false)).toBe(true)
    expect(matchesIgnoreRule(rule, 'src/build', true)).toBe(false)
  })

  it('normalizes backslashes and drops dot and empty segments in the path', () => {
    const rule = requireRule('src/*.ts')
    expect(matchesIgnoreRule(rule, 'src\\main.ts', false)).toBe(true)
    expect(matchesIgnoreRule(rule, './src/main.ts', false)).toBe(true)
    expect(matchesIgnoreRule(rule, './src//main.ts', false)).toBe(true)
  })

  it('matches unsupported wildcard syntax literally', () => {
    const characterClass = requireRule('[abc].txt')
    expect(matchesIgnoreRule(characterClass, '[abc].txt', false)).toBe(true)
    expect(matchesIgnoreRule(characterClass, 'a.txt', false)).toBe(false)

    const questionMark = requireRule('file?.txt')
    expect(matchesIgnoreRule(questionMark, 'file?.txt', false)).toBe(true)
    expect(matchesIgnoreRule(questionMark, 'file1.txt', false)).toBe(false)
  })

  it('treats a backslash inside a pattern as a literal character', () => {
    const rule = requireRule('src\\main.ts')
    expect(matchesIgnoreRule(rule, 'src/main.ts', false)).toBe(false)
  })
})

describe('isIgnored', () => {
  it('returns false when no rule matches', () => {
    expect(isIgnored([], 'src/main.ts', false)).toBe(false)
    expect(isIgnored(parseIgnoreRules(['*.log']), 'src/main.ts', false)).toBe(false)
  })

  it('lets the last matching rule win', () => {
    const ignoreThenKeep = parseIgnoreRules(['*.log', '!keep.log'])
    expect(isIgnored(ignoreThenKeep, 'debug.log', false)).toBe(true)
    expect(isIgnored(ignoreThenKeep, 'keep.log', false)).toBe(false)

    const keepThenIgnore = parseIgnoreRules(['!keep.log', '*.log'])
    expect(isIgnored(keepThenIgnore, 'keep.log', false)).toBe(true)
  })

  it('re-includes paths that a later negated rule matches', () => {
    const rules = parseIgnoreRules(['node_modules/', '!node_modules/keep'])
    expect(isIgnored(rules, 'node_modules/pkg/index.js', false)).toBe(true)
    expect(isIgnored(rules, 'node_modules/keep', false)).toBe(false)
  })

  it('applies directory-only rules to directories and their contents only', () => {
    const rules = parseIgnoreRules(['dist/'])
    expect(isIgnored(rules, 'dist', true)).toBe(true)
    expect(isIgnored(rules, 'dist', false)).toBe(false)
    expect(isIgnored(rules, 'dist/bundle.js', false)).toBe(true)
    expect(isIgnored(rules, 'src/dist.js', false)).toBe(false)
  })

  it('lets a later negated rule override a ** catch-all', () => {
    const rules = parseIgnoreRules(['**', '!src/keep.ts'])
    expect(isIgnored(rules, 'docs/readme.txt', false)).toBe(true)
    expect(isIgnored(rules, 'src/keep.ts', false)).toBe(false)
  })
})
