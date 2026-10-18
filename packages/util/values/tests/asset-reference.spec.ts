import { describe, expect, it } from 'vitest'
import { parseAssetReference, findAssetGuidCollisions, formatAssetGuidCollision } from '../src/asset-reference.ts'

describe('parseAssetReference', () => {
  it('reads guid, fileID, and assetPath from a full meta file', () => {
    const text = [
      'fileFormatVersion: 2',
      'guid: 0123456789abcdef0123456789abcdef',
      'fileID: 11400000',
      'assetPath: "Assets/Scenes/Sample.unity"',
      'DefaultImporter:',
    ].join('\n')
    const ref = parseAssetReference(text)
    expect(ref).not.toBeNull()
    expect(ref!.guid).toBe('0123456789abcdef0123456789abcdef')
    expect(ref!.fileID).toBe('11400000')
    expect(ref!.assetPath).toBe('Assets/Scenes/Sample.unity')
  })

  it('reads lowercase and uppercase guid characters', () => {
    const text = 'guid: ABCDEF0123456789ABCDEF0123456789\n'
    const ref = parseAssetReference(text)
    expect(ref?.guid).toBe('ABCDEF0123456789ABCDEF0123456789')
  })

  it('returns null when no guid is present', () => {
    expect(parseAssetReference('fileID: 11400000\n')).toBeNull()
    expect(parseAssetReference('')).toBeNull()
  })

  it('reads fileID as null when absent', () => {
    const text = 'guid: 0123456789abcdef0123456789abcdef\n'
    const ref = parseAssetReference(text)
    expect(ref?.guid).toBe('0123456789abcdef0123456789abcdef')
    expect(ref?.fileID).toBeNull()
  })

  it('reads assetPath as null when absent', () => {
    const text = 'guid: 0123456789abcdef0123456789abcdef\nfileID: 11400000\n'
    const ref = parseAssetReference(text)
    expect(ref?.assetPath).toBeNull()
  })

  it('ignores guid-like text inside other keys', () => {
    const text = 'description: some guid: 00000000000000000000000000000000 text\nguid: 11111111222222223333333344444444\n'
    const ref = parseAssetReference(text)
    expect(ref?.guid).toBe('11111111222222223333333344444444')
  })
})

describe('findGuidCollisions', () => {
  it('finds collisions when two assets share a guid', () => {
    const refs = [
      { guid: 'aaaabbbbccccddddeeeeffff00001111', fileID: '1', assetPath: 'Assets/A.unity' },
      { guid: 'aaaabbbbccccddddeeeeffff00001111', fileID: '2', assetPath: 'Assets/B.unity' },
      { guid: 'zzzzyyyyxxxxwwwwvvvvuuuu111122223333', fileID: '3', assetPath: 'Assets/C.unity' },
    ]
    const collisions = findAssetGuidCollisions(refs)
    expect(collisions).toHaveLength(1)
    expect(collisions[0].guid).toBe('aaaabbbbccccddddeeeeffff00001111')
    expect(collisions[0].assetPaths).toEqual(['Assets/A.unity', 'Assets/B.unity'])
  })

  it('returns an empty array when no guid collides', () => {
    const refs = [
      { guid: 'aaaabbbbccccddddeeeeffff00001111', fileID: '1', assetPath: 'Assets/A.unity' },
      { guid: 'zzzzyyyyxxxxwwwwvvvvuuuu111122223333', fileID: '2', assetPath: 'Assets/B.unity' },
    ]
    expect(findAssetGuidCollisions(refs)).toEqual([])
  })

  it('ignores references with no asset path', () => {
    const refs = [
      { guid: 'aaaabbbbccccddddeeeeffff00001111', fileID: '1', assetPath: null },
      { guid: 'aaaabbbbccccddddeeeeffff00001111', fileID: '2', assetPath: 'Assets/B.unity' },
    ]
    expect(findAssetGuidCollisions(refs)).toEqual([])
  })

  it('sorts collision groups by guid and asset paths within each group', () => {
    const refs = [
      { guid: 'zzzzyyyyxxxxwwwwvvvvuuuu111122223333', fileID: '1', assetPath: 'Assets/Z.unity' },
      { guid: 'zzzzyyyyxxxxwwwwvvvvuuuu111122223333', fileID: '2', assetPath: 'Assets/Y.unity' },
      { guid: 'aaaabbbbccccddddeeeeffff00001111', fileID: '2', assetPath: 'Assets/A.unity' },
      { guid: 'aaaabbbbccccddddeeeeffff00001111', fileID: '3', assetPath: 'Assets/M.unity' },
    ]
    const collisions = findAssetGuidCollisions(refs)
    expect(collisions).toHaveLength(2)
    expect(collisions[0].guid).toBe('aaaabbbbccccddddeeeeffff00001111')
    expect(collisions[0].assetPaths).toEqual(['Assets/A.unity', 'Assets/M.unity'])
    expect(collisions[1].guid).toBe('zzzzyyyyxxxxwwwwvvvvuuuu111122223333')
    expect(collisions[1].assetPaths).toEqual(['Assets/Y.unity', 'Assets/Z.unity'])
  })
})

describe('formatAssetGuidCollision', () => {
  it('renders one collision group', () => {
    const collision = {
      guid: 'aaaabbbbccccddddeeeeffff00001111',
      assetPaths: ['Assets/A.unity', 'Assets/B.unity'],
    }
    expect(formatAssetGuidCollision(collision)).toBe('GUID aaaabbbbccccddddeeeeffff00001111: Assets/A.unity, Assets/B.unity')
  })
})
