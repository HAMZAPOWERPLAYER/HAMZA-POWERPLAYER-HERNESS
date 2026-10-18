import { describe, expect, it } from 'vitest'
import {
  auditUnityMeta,
  collectGuids,
  findGuidCollisions,
  formatUnityMetaAudit,
  type UnityMetaAudit,
} from '../src/unity-meta-audit.ts'

const HEX_LOWER = '0123456789abcdef0123456789abcdef'
const HEX_UPPER = '0123456789ABCDEF0123456789ABCDEF'
const HEX_OTHER = 'fedcba9876543210fedcba9876543210'
const HEX_THIRD = 'aaaabbbbccccddddaaaabbbbccccdddd'

/** Build the text of a Unity `.meta` file carrying one GUID. */
function metaText(guid: string): string {
  return `fileFormatVersion: 2\nguid: ${guid}\n`
}

/** Build one supplied `.meta` entry with a GUID line. */
function metaEntry(path: string, guid: string): { readonly path: string; readonly content: string } {
  return { path, content: metaText(guid) }
}

describe('auditUnityMeta', () => {
  it('reports a clean project as three empty lists', () => {
    const audit = auditUnityMeta([
      'Assets/Scenes/Level1.unity',
      'Assets/Scenes/Level1.unity.meta',
      'Assets/Scripts/Player.cs',
      'Assets/Scripts/Player.cs.meta',
    ])
    expect(audit).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('reports an empty path list as three empty lists', () => {
    expect(auditUnityMeta([])).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('reports an asset whose companion meta is missing', () => {
    const audit = auditUnityMeta([
      'Assets/Scenes/Level1.unity',
      'Assets/Scenes/Level1.unity.meta',
      'Assets/Scripts/Player.cs',
    ])
    expect(audit.missingMeta).toEqual(['Assets/Scripts/Player.cs'])
    expect(audit.orphanMeta).toEqual([])
  })

  it('reports a meta whose asset is absent', () => {
    const audit = auditUnityMeta(['Assets/Textures/Hero.png.meta'])
    expect(audit.orphanMeta).toEqual(['Assets/Textures/Hero.png.meta'])
    expect(audit.missingMeta).toEqual([])
  })

  it('reports missing and orphan metas together', () => {
    const audit = auditUnityMeta([
      'Assets/A.cs',
      'Assets/B.cs',
      'Assets/B.cs.meta',
      'Assets/Gone.prefab.meta',
    ])
    expect(audit.missingMeta).toEqual(['Assets/A.cs'])
    expect(audit.orphanMeta).toEqual(['Assets/Gone.prefab.meta'])
  })

  it('pairs an asset nested below several directories', () => {
    const audit = auditUnityMeta([
      'Assets/Art/Characters/Hero/Idle.png',
      'Assets/Art/Characters/Hero/Idle.png.meta',
    ])
    expect(audit).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('normalizes backslash separators before pairing', () => {
    const audit = auditUnityMeta([
      'Assets\\Scenes\\Level1.unity',
      'Assets/Scenes/Level1.unity.meta',
    ])
    expect(audit).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('reports backslash paths in normalized form', () => {
    const audit = auditUnityMeta(['Assets\\Scripts\\Player.cs', 'Assets\\Scripts\\Gone.cs.meta'])
    expect(audit.missingMeta).toEqual(['Assets/Scripts/Player.cs'])
    expect(audit.orphanMeta).toEqual(['Assets/Scripts/Gone.cs.meta'])
  })

  it('ignores directory markers that end with a separator', () => {
    const audit = auditUnityMeta([
      'Assets/',
      'Assets/Scenes/',
      'Assets\\Scripts\\',
      'Assets/Scenes/Level1.unity',
      'Assets/Scenes/Level1.unity.meta',
    ])
    expect(audit).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('ignores paths outside the Assets directory', () => {
    const audit = auditUnityMeta([
      'ProjectSettings/ProjectVersion.txt',
      'ProjectSettings/ProjectVersion.txt.meta',
      'Packages/manifest.json',
      'Library/ScriptAssemblies/Assembly-CSharp.dll',
      'Assets/Foo.cs',
      'Assets/Foo.cs.meta',
    ])
    expect(audit).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('requires the complete, case-sensitive Assets prefix', () => {
    const audit = auditUnityMeta(['assets/Player.cs', 'Assets', 'ASSETS/Player.cs'])
    expect(audit).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('keeps StreamingAssets in scope', () => {
    expect(auditUnityMeta(['Assets/StreamingAssets/db.json']).missingMeta).toEqual([
      'Assets/StreamingAssets/db.json',
    ])
    expect(
      auditUnityMeta(['Assets/StreamingAssets/db.json', 'Assets/StreamingAssets/db.json.meta']),
    ).toEqual({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })
  })

  it('lists a .meta.meta path as meta of meta and as an orphan', () => {
    const audit = auditUnityMeta(['Assets/Foo.cs.meta.meta'])
    expect(audit.metaOfMeta).toEqual(['Assets/Foo.cs.meta.meta'])
    expect(audit.orphanMeta).toEqual(['Assets/Foo.cs.meta.meta'])
    expect(audit.missingMeta).toEqual([])
  })

  it('treats a .meta path as absent when an outer .meta.meta path needs it', () => {
    const audit = auditUnityMeta(['Assets/Foo.cs.meta', 'Assets/Foo.cs.meta.meta'])
    expect(audit.orphanMeta).toEqual(['Assets/Foo.cs.meta', 'Assets/Foo.cs.meta.meta'])
    expect(audit.metaOfMeta).toEqual(['Assets/Foo.cs.meta.meta'])
  })

  it('never treats a .meta path as an asset', () => {
    const audit = auditUnityMeta(['Assets/Foo.cs.meta'])
    expect(audit.missingMeta).toEqual([])
    expect(audit.orphanMeta).toEqual(['Assets/Foo.cs.meta'])
  })

  it('de-duplicates repeated and separator-varied entries', () => {
    const audit = auditUnityMeta([
      'Assets/Scripts/Player.cs',
      'Assets\\Scripts\\Player.cs',
      'Assets/Scripts/Player.cs.meta',
      'Assets\\Scripts\\Player.cs.meta',
      'Assets/Gone.cs',
      'Assets/Gone.cs',
    ])
    expect(audit.missingMeta).toEqual(['Assets/Gone.cs'])
    expect(audit.orphanMeta).toEqual([])
  })

  it('sorts missing meta paths', () => {
    const audit = auditUnityMeta(['Assets/b.cs', 'Assets/a.cs', 'Assets/C.cs'])
    expect(audit.missingMeta).toEqual(['Assets/C.cs', 'Assets/a.cs', 'Assets/b.cs'])
  })

  it('sorts orphan meta paths', () => {
    const audit = auditUnityMeta(['Assets/z.png.meta', 'Assets/a.png.meta'])
    expect(audit.orphanMeta).toEqual(['Assets/a.png.meta', 'Assets/z.png.meta'])
  })

  it('sorts meta of meta paths', () => {
    const audit = auditUnityMeta(['Assets/z.png.meta.meta', 'Assets/a.png.meta.meta'])
    expect(audit.metaOfMeta).toEqual(['Assets/a.png.meta.meta', 'Assets/z.png.meta.meta'])
  })
})

describe('collectGuids', () => {
  it('reads a lowercase guid from a meta text', () => {
    expect(collectGuids([metaEntry('Assets/Foo.cs.meta', HEX_LOWER)])).toEqual([
      { path: 'Assets/Foo.cs.meta', guid: HEX_LOWER },
    ])
  })

  it('folds uppercase hex digits to lowercase', () => {
    expect(collectGuids([metaEntry('Assets/Foo.cs.meta', HEX_UPPER)])).toEqual([
      { path: 'Assets/Foo.cs.meta', guid: HEX_LOWER },
    ])
  })

  it('reads the guid line after other content', () => {
    const content = ['fileFormatVersion: 2', 'serializedVersion: 3', `guid: ${HEX_LOWER}`, 'labels:'].join('\n')
    expect(collectGuids([{ path: 'Assets/Foo.cs.meta', content }])).toEqual([
      { path: 'Assets/Foo.cs.meta', guid: HEX_LOWER },
    ])
  })

  it('tolerates spaces around the key and the value', () => {
    const content = `fileFormatVersion: 2\n  guid :   ${HEX_LOWER}   \n`
    expect(collectGuids([{ path: 'Assets/Foo.cs.meta', content }])).toEqual([
      { path: 'Assets/Foo.cs.meta', guid: HEX_LOWER },
    ])
  })

  it('reads a guid from CRLF text', () => {
    const content = `fileFormatVersion: 2\r\nguid: ${HEX_LOWER}\r\n`
    expect(collectGuids([{ path: 'Assets/Foo.cs.meta', content }])).toEqual([
      { path: 'Assets/Foo.cs.meta', guid: HEX_LOWER },
    ])
  })

  it('ignores paths that are not meta files', () => {
    const entries: readonly { readonly path: string; readonly content: string }[] = [
      { path: 'Assets/Foo.cs', content: metaText(HEX_LOWER) },
      { path: 'Assets/readme.txt', content: `guid: ${HEX_LOWER}` },
      { path: 'Assets/Scenes/', content: metaText(HEX_LOWER) },
    ]
    expect(collectGuids(entries)).toEqual([])
  })

  it('drops values that are not 32 hexadecimal digits', () => {
    const entries = [
      { path: 'Assets/Short.cs.meta', content: metaText('0123456789abcdef') },
      { path: 'Assets/Long.cs.meta', content: metaText(`${HEX_LOWER}0`) },
      { path: 'Assets/NonHex.cs.meta', content: metaText('0123456789abcdef0123456789abcdeg') },
    ]
    expect(collectGuids(entries)).toEqual([])
  })

  it('returns no entry when the meta text carries no guid line', () => {
    expect(collectGuids([{ path: 'Assets/Foo.cs.meta', content: 'fileFormatVersion: 2\n' }])).toEqual([])
    expect(collectGuids([{ path: 'Assets/Foo.cs.meta', content: '' }])).toEqual([])
  })

  it('sorts entries by path', () => {
    const entries = [
      metaEntry('Assets/z.cs.meta', HEX_OTHER),
      metaEntry('Assets/a.cs.meta', HEX_LOWER),
      metaEntry('Assets/m.cs.meta', HEX_THIRD),
    ]
    expect(collectGuids(entries)).toEqual([
      { path: 'Assets/a.cs.meta', guid: HEX_LOWER },
      { path: 'Assets/m.cs.meta', guid: HEX_THIRD },
      { path: 'Assets/z.cs.meta', guid: HEX_OTHER },
    ])
  })
})

describe('findGuidCollisions', () => {
  it('finds no collision when every guid is unique', () => {
    const collisions = findGuidCollisions([
      metaEntry('Assets/a.cs.meta', HEX_LOWER),
      metaEntry('Assets/b.cs.meta', HEX_OTHER),
    ])
    expect(collisions).toEqual([])
  })

  it('reports two paths that share a guid', () => {
    const collisions = findGuidCollisions([
      metaEntry('Assets/z.cs.meta', HEX_LOWER),
      metaEntry('Assets/a.cs.meta', HEX_LOWER),
    ])
    expect(collisions).toEqual([{ guid: HEX_LOWER, paths: ['Assets/a.cs.meta', 'Assets/z.cs.meta'] }])
  })

  it('reports three paths that share a guid with the paths sorted', () => {
    const collisions = findGuidCollisions([
      metaEntry('Assets/c.cs.meta', HEX_LOWER),
      metaEntry('Assets/a.cs.meta', HEX_LOWER),
      metaEntry('Assets/b.cs.meta', HEX_LOWER),
    ])
    expect(collisions).toHaveLength(1)
    expect(collisions[0]?.paths).toEqual(['Assets/a.cs.meta', 'Assets/b.cs.meta', 'Assets/c.cs.meta'])
  })

  it('matches an uppercase guid spelling with its lowercase spelling', () => {
    const collisions = findGuidCollisions([
      metaEntry('Assets/a.cs.meta', HEX_LOWER),
      metaEntry('Assets/b.cs.meta', HEX_UPPER),
    ])
    expect(collisions).toEqual([{ guid: HEX_LOWER, paths: ['Assets/a.cs.meta', 'Assets/b.cs.meta'] }])
  })

  it('reports no collision when one path repeats a guid', () => {
    const collisions = findGuidCollisions([
      metaEntry('Assets/a.cs.meta', HEX_LOWER),
      metaEntry('Assets/a.cs.meta', HEX_LOWER),
    ])
    expect(collisions).toEqual([])
  })

  it('sorts collisions by guid', () => {
    const collisions = findGuidCollisions([
      metaEntry('Assets/a.cs.meta', HEX_OTHER),
      metaEntry('Assets/b.cs.meta', HEX_OTHER),
      metaEntry('Assets/c.cs.meta', HEX_LOWER),
      metaEntry('Assets/d.cs.meta', HEX_LOWER),
    ])
    expect(collisions.map(collision => collision.guid)).toEqual([HEX_LOWER, HEX_OTHER])
  })

  it('ignores supplied texts without a valid guid', () => {
    const collisions = findGuidCollisions([
      { path: 'Assets/a.cs.meta', content: 'fileFormatVersion: 2\n' },
      { path: 'Assets/b.cs.meta', content: metaText('not-a-guid') },
      { path: 'Assets/c.cs', content: metaText(HEX_LOWER) },
    ])
    expect(collisions).toEqual([])
  })
})

describe('formatUnityMetaAudit', () => {
  it('renders a clean audit as one fixed line', () => {
    expect(formatUnityMetaAudit({ missingMeta: [], orphanMeta: [], metaOfMeta: [] })).toBe(
      'unity meta audit: clean',
    )
  })

  it('renders one line for a single non-empty category', () => {
    const audit = auditUnityMeta(['Assets/b.cs', 'Assets/a.cs'])
    expect(formatUnityMetaAudit(audit)).toBe('missing meta: 2 (Assets/a.cs, Assets/b.cs)')
  })

  it('renders categories in the fixed order', () => {
    const audit: UnityMetaAudit = {
      missingMeta: ['Assets/One.cs'],
      orphanMeta: ['Assets/Two.png.meta'],
      metaOfMeta: ['Assets/Three.png.meta.meta'],
    }
    expect(formatUnityMetaAudit(audit)).toBe(
      [
        'missing meta: 1 (Assets/One.cs)',
        'orphan meta: 1 (Assets/Two.png.meta)',
        'meta of meta: 1 (Assets/Three.png.meta.meta)',
      ].join('\n'),
    )
  })

  it('skips an empty category between non-empty ones', () => {
    const audit: UnityMetaAudit = {
      missingMeta: ['Assets/One.cs'],
      orphanMeta: [],
      metaOfMeta: ['Assets/Three.png.meta.meta'],
    }
    expect(formatUnityMetaAudit(audit)).toBe(
      ['missing meta: 1 (Assets/One.cs)', 'meta of meta: 1 (Assets/Three.png.meta.meta)'].join('\n'),
    )
  })

  it('formats an audit built from a path list', () => {
    const audit = auditUnityMeta(['Assets/Scripts/Player.cs', 'Assets/Textures/Hero.png.meta'])
    expect(formatUnityMetaAudit(audit)).toBe(
      [
        'missing meta: 1 (Assets/Scripts/Player.cs)',
        'orphan meta: 1 (Assets/Textures/Hero.png.meta)',
      ].join('\n'),
    )
  })
})
