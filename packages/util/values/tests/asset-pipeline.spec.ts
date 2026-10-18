import { describe, expect, it } from 'vitest'
import {
  buildAssetInventory,
  isAudioAsset,
  isModelAsset,
  isTextureAsset,
  validateAssetInventory,
} from '../src/index.ts'

/** One observed file as `buildAssetInventory` consumes it. */
interface ObservedFile {
  readonly path: string
  readonly sizeBytes: number
  readonly content: string | null
}

function file(path: string, sizeBytes: number, content: string | null): ObservedFile {
  return { path, sizeBytes, content }
}

describe('buildAssetInventory', () => {
  it('totals count and size across observed files', () => {
    const inventory = buildAssetInventory([
      file('hero.png', 100, null),
      file('music.wav', 250, null),
      file('logic.cs', 50, null),
    ])
    expect(inventory.totalCount).toBe(3)
    expect(inventory.totalSizeBytes).toBe(400)
    expect(inventory.assets).toHaveLength(3)
    expect(inventory.assets.map((a) => a.importHash)).toEqual([null, null, null])
    expect(inventory.byType).toEqual([
      { type: 'texture', count: 1, sizeBytes: 100 },
      { type: 'audio', count: 1, sizeBytes: 250 },
      { type: 'script', count: 1, sizeBytes: 50 },
    ])
    expect(inventory.missingReferences).toEqual([])
  })

  it('reports nothing for an empty file list', () => {
    const inventory = buildAssetInventory([])
    expect(inventory.assets).toEqual([])
    expect(inventory.totalCount).toBe(0)
    expect(inventory.totalSizeBytes).toBe(0)
    expect(inventory.byType).toEqual([])
    expect(inventory.unreferenced).toEqual([])
    expect(inventory.missingReferences).toEqual([])
  })

  it('infers asset types from the file extension', () => {
    const paths = [
      'Hero.PNG',
      'crate.fbx',
      'walk.anim',
      'theme.mp3',
      'ui.ttf',
      'level.tscn',
      'enemy.prefab',
      'logic.gd',
      'notes.txt',
    ]
    const inventory = buildAssetInventory(paths.map((path) => file(path, 1, null)))
    const types = Object.fromEntries(inventory.assets.map((a) => [a.path, a.type]))
    expect(types).toEqual({
      'Hero.PNG': 'texture',
      'crate.fbx': 'model',
      'walk.anim': 'animation',
      'theme.mp3': 'audio',
      'ui.ttf': 'font',
      'level.tscn': 'scene',
      'enemy.prefab': 'prefab',
      'logic.gd': 'script',
      'notes.txt': 'other',
    })
  })

  it('aggregates counts and sizes by type', () => {
    const inventory = buildAssetInventory([
      file('a.png', 10, null),
      file('b.jpg', 20, null),
      file('c.obj', 40, null),
    ])
    expect(inventory.byType).toEqual([
      { type: 'texture', count: 2, sizeBytes: 30 },
      { type: 'model', count: 1, sizeBytes: 40 },
    ])
  })

  it('marks an asset referenced when another file quotes its path', () => {
    const inventory = buildAssetInventory([
      file('Level.tscn', 10, 'sprite = "hero.png"'),
      file('hero.png', 20, null),
    ])
    const scene = inventory.assets.filter((a) => a.path === 'Level.tscn')
    expect(scene).toHaveLength(1)
    expect(scene[0]!.referencedBy).toEqual(['hero.png'])
    expect(scene[0]!.referenced).toBe(false)
    expect(inventory.assets.filter((a) => a.path === 'hero.png').map((a) => a.referenced)).toEqual([true])
    expect(inventory.unreferenced).toEqual(['Level.tscn'])
    expect(inventory.missingReferences).toEqual([])
  })

  it('resolves references by path suffix', () => {
    const inventory = buildAssetInventory([
      file('scenes/Level.tscn', 10, 'use("art/hero.png")'),
      file('game/art/hero.png', 20, null),
    ])
    const scene = inventory.assets.filter((a) => a.path === 'scenes/Level.tscn')
    expect(scene[0]!.referencedBy).toEqual(['game/art/hero.png'])
    expect(inventory.unreferenced).toEqual(['scenes/Level.tscn'])
    expect(inventory.missingReferences).toEqual([])
  })

  it('resolves a reference through a meta file', () => {
    const inventory = buildAssetInventory([
      file('Level.tscn', 10, 'use("hero.png")'),
      file('hero.png.meta', 5, null),
    ])
    const scene = inventory.assets.filter((a) => a.path === 'Level.tscn')
    expect(scene[0]!.referencedBy).toEqual(['hero.png.meta'])
    expect(inventory.unreferenced).toEqual(['Level.tscn'])
  })

  it('records references that resolve to no observed file', () => {
    const inventory = buildAssetInventory([
      file('Level.tscn', 10, 'load("ghost.png")'),
      file('other.png', 20, null),
    ])
    expect(inventory.missingReferences).toEqual(['ghost.png'])
    const scene = inventory.assets.filter((a) => a.path === 'Level.tscn')
    expect(scene[0]!.referencedBy).toEqual([])
    expect(inventory.unreferenced).toEqual(['Level.tscn', 'other.png'])
  })

  it('deduplicates and sorts missing references', () => {
    const inventory = buildAssetInventory([
      file('a.cs', 1, 'x = "z.png"; y = "ghost.png"'),
      file('b.cs', 1, 'x = "ghost.png"; y = "a1.png"'),
    ])
    expect(inventory.missingReferences).toEqual(['a1.png', 'ghost.png', 'z.png'])
  })

  it('does not mark an asset referenced by itself', () => {
    const inventory = buildAssetInventory([file('level.unity', 10, 'scene = "level.unity"')])
    expect(inventory.assets.filter((a) => a.path === 'level.unity').map((a) => a.referenced)).toEqual([false])
    expect(inventory.unreferenced).toEqual(['level.unity'])
  })
})

describe('validateAssetInventory', () => {
  it('accepts a fully referenced, small inventory', () => {
    const inventory = buildAssetInventory([
      file('hero.png', 100, '"Logic.cs"'),
      file('Logic.cs', 100, '"Level.tscn"'),
      file('Level.tscn', 100, '"hero.png"'),
    ])
    expect(validateAssetInventory(inventory)).toEqual([])
  })

  it('reports unreferenced assets with a count', () => {
    const inventory = buildAssetInventory([file('a.png', 1, null), file('b.png', 1, null)])
    expect(validateAssetInventory(inventory)).toEqual(['2 unreferenced asset(s) found'])
  })

  it('reports missing references with only the first five paths', () => {
    const content = '"f1.png" "f2.png" "f3.png" "f4.png" "f5.png" "f6.png" "f7.png"'
    const inventory = buildAssetInventory([file('refs.cs', 1, content)])
    expect(inventory.missingReferences).toHaveLength(7)
    expect(validateAssetInventory(inventory)).toEqual([
      '1 unreferenced asset(s) found',
      '7 missing reference(s): f1.png, f2.png, f3.png, f4.png, f5.png',
    ])
  })

  it('reports assets larger than fifty megabytes', () => {
    const inventory = buildAssetInventory([file('big.png', 50 * 1024 * 1024 + 1, null)])
    const problems = validateAssetInventory(inventory)
    expect(problems).toContain('1 asset(s) exceed 50MB')
    expect(problems).toContain('1 unreferenced asset(s) found')
  })

  it('accepts an asset of exactly fifty megabytes', () => {
    const inventory = buildAssetInventory([file('big.png', 50 * 1024 * 1024, null)])
    expect(validateAssetInventory(inventory)).toEqual(['1 unreferenced asset(s) found'])
  })
})

describe('isTextureAsset', () => {
  it('true for image paths', () => {
    expect(isTextureAsset('hero.PNG')).toBe(true)
    expect(isTextureAsset('icon.tga')).toBe(true)
    expect(isTextureAsset('photo.jpeg')).toBe(true)
  })

  it('false for other paths', () => {
    expect(isTextureAsset('model.fbx')).toBe(false)
    expect(isTextureAsset('theme.mp3')).toBe(false)
    expect(isTextureAsset('font.ttf')).toBe(false)
  })
})

describe('isAudioAsset', () => {
  it('true for sound paths', () => {
    expect(isAudioAsset('music.OGG')).toBe(true)
    expect(isAudioAsset('shot.wav')).toBe(true)
    expect(isAudioAsset('voice.aac')).toBe(true)
  })

  it('false for other paths', () => {
    expect(isAudioAsset('hero.png')).toBe(false)
    expect(isAudioAsset('logic.cs')).toBe(false)
  })
})

describe('isModelAsset', () => {
  it('true for model paths', () => {
    expect(isModelAsset('crate.obj')).toBe(true)
    expect(isModelAsset('hero.fbx')).toBe(true)
    expect(isModelAsset('rig.blend')).toBe(true)
  })

  it('false for other paths', () => {
    expect(isModelAsset('idle.anim')).toBe(false)
    expect(isModelAsset('hero.png')).toBe(false)
  })
})
