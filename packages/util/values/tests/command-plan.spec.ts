import { describe, expect, it } from 'vitest'
import {
  createCommandPlan,
  describeCommandPlan,
  isSafeExecutableName,
  selectedArguments,
} from '../src/command-plan.ts'

describe('createCommandPlan', () => {
  it('defaults to an empty argument list without a working directory', () => {
    const plan = createCommandPlan('node')
    expect(plan.executable).toBe('node')
    expect(plan.args).toEqual([])
    expect(plan.cwd).toBeUndefined()
  })

  it('omits the cwd key when no working directory is given', () => {
    expect(Object.keys(createCommandPlan('node'))).toEqual(['executable', 'args'])
  })

  it('carries the cwd key when a working directory is given', () => {
    const plan = createCommandPlan('node', ['-e', '0'], 'C:\\work')
    expect(Object.keys(plan)).toEqual(['executable', 'args', 'cwd'])
    expect(plan.cwd).toBe('C:\\work')
  })

  it('preserves argument order', () => {
    expect(createCommandPlan('git', ['commit', '-m', 'msg']).args).toEqual(['commit', '-m', 'msg'])
  })

  it('copies the caller argument list', () => {
    const args = ['a']
    const plan = createCommandPlan('node', args)
    args.push('b')
    expect(plan.args).toEqual(['a'])
    expect(plan.args).toHaveLength(1)
  })

  it('throws when the executable is empty or whitespace only', () => {
    expect(() => createCommandPlan('')).toThrow('executable must not be empty')
    expect(() => createCommandPlan('   ')).toThrow('executable must not be empty')
    expect(() => createCommandPlan('\t')).toThrow('executable must not be empty')
  })

  it('throws when the executable contains NUL', () => {
    expect(() => createCommandPlan('no\0de')).toThrow('executable must not contain NUL')
  })

  it('throws when the executable contains a forward slash', () => {
    expect(() => createCommandPlan('/usr/bin/node')).toThrow(
      'executable must not contain a path separator',
    )
  })

  it('throws when the executable contains a backslash', () => {
    expect(() => createCommandPlan('bin\\node')).toThrow(
      'executable must not contain a path separator',
    )
  })

  it('throws when an argument contains NUL', () => {
    expect(() => createCommandPlan('node', ['ok', 'bad\0arg'])).toThrow(
      'argument must not contain NUL',
    )
  })

  it('throws when cwd is empty or whitespace only', () => {
    expect(() => createCommandPlan('node', [], '')).toThrow('cwd must not be empty')
    expect(() => createCommandPlan('node', [], '  ')).toThrow('cwd must not be empty')
  })

  it('throws when cwd contains NUL', () => {
    expect(() => createCommandPlan('node', [], 'work\0')).toThrow('cwd must not contain NUL')
  })
})

describe('describeCommandPlan', () => {
  it('joins the executable and plain arguments with single spaces', () => {
    expect(describeCommandPlan(createCommandPlan('git', ['status', '--short']))).toBe(
      'git status --short',
    )
  })

  it('renders a command without arguments', () => {
    expect(describeCommandPlan(createCommandPlan('make'))).toBe('make')
  })

  it('quotes an empty argument', () => {
    expect(describeCommandPlan(createCommandPlan('echo', ['', 'x']))).toBe('echo "" x')
  })

  it('quotes an argument containing a space', () => {
    expect(describeCommandPlan(createCommandPlan('echo', ['hello world']))).toBe('echo "hello world"')
  })

  it('escapes double quotes inside a quoted argument', () => {
    expect(describeCommandPlan(createCommandPlan('echo', ['say "hi"']))).toBe('echo "say \\"hi\\""')
  })

  it('escapes backslashes inside a quoted argument', () => {
    expect(describeCommandPlan(createCommandPlan('echo', ['a\\b']))).toBe('echo "a\\\\b"')
  })

  it('leaves the allowed character set unquoted', () => {
    expect(describeCommandPlan(createCommandPlan('run', ['aZ9._/@:=+,-']))).toBe('run aZ9._/@:=+,-')
  })

  it('quotes an argument holding a character outside the allowed set', () => {
    expect(describeCommandPlan(createCommandPlan('run', ['a*b']))).toBe('run "a*b"')
    expect(describeCommandPlan(createCommandPlan('run', ['a;b']))).toBe('run "a;b"')
  })

  it('prefixes the working directory when the plan has one', () => {
    expect(describeCommandPlan(createCommandPlan('make', ['all'], 'src'))).toBe('cwd=src make all')
  })
})

describe('isSafeExecutableName', () => {
  it('accepts plain executable names', () => {
    expect(isSafeExecutableName('node')).toBe(true)
    expect(isSafeExecutableName('python3.12')).toBe(true)
    expect(isSafeExecutableName('my-tool_v2.exe')).toBe(true)
  })

  it('accepts punctuation outside the rejected classes', () => {
    expect(isSafeExecutableName('a,b')).toBe(true)
    expect(isSafeExecutableName('a+b')).toBe(true)
    expect(isSafeExecutableName('a=b')).toBe(true)
    expect(isSafeExecutableName('a:b')).toBe(true)
    expect(isSafeExecutableName('a@b')).toBe(true)
  })

  it('rejects an empty name', () => {
    expect(isSafeExecutableName('')).toBe(false)
  })

  it('rejects names containing whitespace', () => {
    expect(isSafeExecutableName('   ')).toBe(false)
    expect(isSafeExecutableName('a b')).toBe(false)
    expect(isSafeExecutableName('a\tb')).toBe(false)
    expect(isSafeExecutableName('a\nb')).toBe(false)
  })

  it('rejects names containing a path separator', () => {
    expect(isSafeExecutableName('bin/node')).toBe(false)
    expect(isSafeExecutableName('bin\\node')).toBe(false)
  })

  it('rejects names containing a shell control character', () => {
    expect(isSafeExecutableName('a&b')).toBe(false)
    expect(isSafeExecutableName('a|b')).toBe(false)
    expect(isSafeExecutableName('a;b')).toBe(false)
    expect(isSafeExecutableName('a<b')).toBe(false)
    expect(isSafeExecutableName('a>b')).toBe(false)
    expect(isSafeExecutableName('a^b')).toBe(false)
    expect(isSafeExecutableName('a%b')).toBe(false)
  })

  it('rejects names containing a quote, dollar, backtick, or parenthesis', () => {
    expect(isSafeExecutableName('a"b')).toBe(false)
    expect(isSafeExecutableName("a'b")).toBe(false)
    expect(isSafeExecutableName('a$b')).toBe(false)
    expect(isSafeExecutableName('a`b')).toBe(false)
    expect(isSafeExecutableName('a(b')).toBe(false)
    expect(isSafeExecutableName('a)b')).toBe(false)
  })
})

describe('selectedArguments', () => {
  it('selects arguments in the requested order', () => {
    const plan = createCommandPlan('node', ['a', 'b', 'c'])
    expect(selectedArguments(plan, [2, 0])).toEqual(['c', 'a'])
  })

  it('allows a repeated index', () => {
    const plan = createCommandPlan('node', ['a', 'b', 'c'])
    expect(selectedArguments(plan, [1, 1, 0])).toEqual(['b', 'b', 'a'])
  })

  it('returns no arguments for an empty index list', () => {
    const plan = createCommandPlan('node', ['a'])
    expect(selectedArguments(plan, [])).toHaveLength(0)
    expect(selectedArguments(plan, [])).toEqual([])
  })

  it('returns every argument when all indices are selected', () => {
    const plan = createCommandPlan('node', ['a', 'b', 'c'])
    expect(selectedArguments(plan, [0, 1, 2])).toEqual(['a', 'b', 'c'])
  })

  it('throws for an index outside the argument range', () => {
    const plan = createCommandPlan('node', ['a', 'b', 'c'])
    expect(() => selectedArguments(plan, [-1])).toThrow('argument index out of range: -1')
    expect(() => selectedArguments(plan, [3])).toThrow('argument index out of range: 3')
  })

  it('throws for a fractional index', () => {
    const plan = createCommandPlan('node', ['a', 'b', 'c'])
    expect(() => selectedArguments(plan, [1.5])).toThrow('argument index out of range: 1.5')
  })
})
