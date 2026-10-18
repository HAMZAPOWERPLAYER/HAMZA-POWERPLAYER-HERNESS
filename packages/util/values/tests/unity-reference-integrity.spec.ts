import { describe, expect, it } from 'vitest'
import {
  auditUnityReferences,
  type ObservedSceneText,
  type UnityReferenceFinding,
} from '../src/unity-reference-integrity.ts'
import { collectGuids } from '../src/unity-meta-audit.ts'
import type { UnityDiagnostic } from '../src/unity-diagnostics.ts'

const KNOWN_SCRIPT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const KNOWN_ASSET = '0123456789abcdef0123456789abcdef'
const MISSING_SCRIPT = 'fedcba9876543210fedcba9876543210'
const MISSING_GUID = 'aaaabbbbccccddddaaaabbbbccccdddd'

/** Build one observed scene entry from its content lines. */
function scene(scenePath: string, lines: readonly string[]): ObservedSceneText {
  return { scenePath, text: lines.join('\n') }
}

/** Render the `[file, line, category]` triple of each finding for ordering assertions. */
function triples(findings: readonly UnityReferenceFinding[]): [string | null, number, string][] {
  return findings.map(finding => [finding.file, finding.line, finding.category])
}

describe('auditUnityReferences', () => {
  describe('missing script check', () => {
    it('reports a component whose m_Script GUID is absent from the known set', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          '%YAML 1.1',
          '--- !u!114 &200000',
          'MonoBehaviour:',
          `  m_Script: {fileID: 11500000, guid: ${MISSING_SCRIPT}, type: 3}`,
          '  m_Name: Player',
        ])],
        [KNOWN_SCRIPT],
        ['Assets/Scenes/Level.unity'],
      )
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toEqual({
        severity: 'error',
        category: 'missing-script',
        message: `m_Script references GUID ${MISSING_SCRIPT}, which is absent from the known GUID set.`,
        file: 'Assets/Scenes/Level.unity',
        suggestion: 'Restore the script asset so its GUID resolves, or remove the component.',
        line: 4,
      })
      expect(result.hasErrors).toBe(true)
      expect(result.hasWarnings).toBe(false)
    })

    it('stays silent when the m_Script GUID is in the known set', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          'MonoBehaviour:',
          `  m_Script: {fileID: 11500000, guid: ${KNOWN_SCRIPT}, type: 3}`,
        ])],
        [KNOWN_SCRIPT],
        [],
      )
      expect(result.findings).toEqual([])
      expect(result.hasErrors).toBe(false)
      expect(result.hasWarnings).toBe(false)
    })

    it('ignores an m_Script line that carries no GUID value', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', ['  m_Script: {fileID: 11500000}'])],
        [],
        [],
      )
      expect(result.findings).toEqual([])
    })
  })

  describe('unresolved GUID check', () => {
    it('warns about another line whose GUID is absent from the known set', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Missing.unity', [
          '%YAML 1.1',
          '--- !u!114 &300000',
          'MonoBehaviour:',
          `  m_Material: {fileID: 2100000, guid: ${MISSING_GUID}, type: 3}`,
          '  m_Name: Wall',
        ])],
        [KNOWN_SCRIPT, KNOWN_ASSET],
        [],
      )
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toEqual({
        severity: 'warning',
        category: 'unresolved-guid',
        message: `GUID ${MISSING_GUID} is referenced but absent from the known GUID set.`,
        file: 'Assets/Scenes/Missing.unity',
        suggestion: "Restore the referenced asset's .meta file, or update the reference.",
        line: 4,
      })
      expect(result.hasErrors).toBe(false)
      expect(result.hasWarnings).toBe(true)
    })

    it('stays silent when a referenced GUID is in the known set', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          `  m_Material: {fileID: 2100000, guid: ${KNOWN_ASSET}, type: 3}`,
        ])],
        [KNOWN_ASSET],
        [],
      )
      expect(result.findings).toEqual([])
    })

    it('matches a GUID against a known entry spelled in another case and with spaces', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          `  m_Source: {fileID: 1, guid: ${KNOWN_SCRIPT}, type: 3}`,
        ])],
        [`  ${KNOWN_SCRIPT.toUpperCase()}  `],
        [],
      )
      expect(result.findings).toEqual([])
    })

    it('ignores GUID values that are not exactly 32 hexadecimal digits', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          `  short: {guid: ${MISSING_GUID.slice(1)}, type: 3}`,
          `  long: {guid: ${MISSING_GUID}a, type: 3}`,
          '  plain: {guid: not-a-guid, type: 3}',
        ])],
        [],
        [],
      )
      expect(result.findings).toEqual([])
    })
  })

  describe('broken path check', () => {
    it('reports a quoted path reference that matches no observed file path', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          '%YAML 1.1',
          '--- !u!1 &100000',
          'GameObject:',
          '  m_Name: Level',
          '  m_ScenePath: "Assets/Scenes/Gone.unity"',
        ])],
        [],
        ['Assets/Scenes/Level.unity'],
      )
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toEqual({
        severity: 'error',
        category: 'broken-path',
        message: 'Path Assets/Scenes/Gone.unity is referenced but matches no observed file path.',
        file: 'Assets/Scenes/Level.unity',
        suggestion: 'Correct the path, or add the file to the observed project listing.',
        line: 5,
      })
      expect(result.hasErrors).toBe(true)
      expect(result.hasWarnings).toBe(false)
    })

    it('stays silent when a quoted path reference matches an observed file path', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          '  m_ScenePath: "Assets/Scenes/Gone.unity"',
        ])],
        [],
        ['Assets/Scenes/Gone.unity'],
      )
      expect(result.findings).toEqual([])
    })

    it('checks unquoted path references line by line', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          'GameObject:',
          '  m_Main: Assets/Scenes/Main.unity',
          '  m_Alt: Assets/Scenes/Alt.unity',
        ])],
        [],
        ['Assets/Scenes/Main.unity'],
      )
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toEqual({
        severity: 'error',
        category: 'broken-path',
        message: 'Path Assets/Scenes/Alt.unity is referenced but matches no observed file path.',
        file: 'Assets/Scenes/Level.unity',
        suggestion: 'Correct the path, or add the file to the observed project listing.',
        line: 3,
      })
    })

    it('folds backslash separators in observed file paths', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          '  m_Main: Assets/Scenes/Main.unity',
        ])],
        [],
        ['Assets\\Scenes\\Main.unity'],
      )
      expect(result.findings).toEqual([])
    })

    it('skips directory references that end with a separator', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', ['  m_Folder: Assets/Scenes/'])],
        [],
        [],
      )
      expect(result.findings).toEqual([])
    })

    it('keeps spaces inside a quoted path reference', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          '  m_Label: "Assets/Art/Hero Pose.png"',
          '  m_Gone: "Assets/Art/Gone Pose.png"',
        ])],
        [],
        ['Assets/Art/Hero Pose.png'],
      )
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toEqual({
        severity: 'error',
        category: 'broken-path',
        message: 'Path Assets/Art/Gone Pose.png is referenced but matches no observed file path.',
        file: 'Assets/Scenes/Level.unity',
        suggestion: 'Correct the path, or add the file to the observed project listing.',
        line: 2,
      })
    })

    it('reports each missing path token on one line separately', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          '  m_List: [Assets/Art/One.png, Assets/Art/Two.png]',
        ])],
        [],
        [],
      )
      expect(result.findings.map(finding => finding.message)).toEqual([
        'Path Assets/Art/One.png is referenced but matches no observed file path.',
        'Path Assets/Art/Two.png is referenced but matches no observed file path.',
      ])
      expect(result.findings.map(finding => finding.line)).toEqual([1, 1])
    })
  })

  describe('finding order', () => {
    it('orders findings by scene path, then line number, whatever the input order', () => {
      const zeta = scene('Assets/Zeta.unity', [
        `  m_Script: {fileID: 11500000, guid: ${MISSING_SCRIPT}, type: 3}`,
        '',
        `  m_Material: {fileID: 2100000, guid: ${MISSING_GUID}, type: 3}`,
      ])
      const alpha = scene('Assets/Alpha.unity', [
        `  m_Material: {fileID: 2100000, guid: ${MISSING_GUID}, type: 3}`,
      ])
      const expected: [string, number, string][] = [
        ['Assets/Alpha.unity', 1, 'unresolved-guid'],
        ['Assets/Zeta.unity', 1, 'missing-script'],
        ['Assets/Zeta.unity', 3, 'unresolved-guid'],
      ]
      const reversedFirst = auditUnityReferences([zeta, alpha], [], [])
      expect(triples(reversedFirst.findings)).toEqual(expected)
      const inOrderFirst = auditUnityReferences([alpha, zeta], [], [])
      expect(triples(inOrderFirst.findings)).toEqual(expected)
    })

    it('orders different checks on one line by check order', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          `  m_Mixed: {guid: ${MISSING_GUID}, type: 3} Assets/Gone.png`,
        ])],
        [],
        [],
      )
      expect(result.findings.map(finding => finding.category)).toEqual([
        'unresolved-guid',
        'broken-path',
      ])
      expect(result.findings.every(finding => finding.line === 1)).toBe(true)
    })

    it('returns identical results on repeated audits', () => {
      const observed = [scene('Assets/Scenes/Level.unity', [
        `  m_Script: {fileID: 11500000, guid: ${MISSING_SCRIPT}, type: 3}`,
        '  m_Gone: Assets/Art/Gone.png',
      ])]
      const first = auditUnityReferences(observed, [], [])
      const second = auditUnityReferences(observed, [], [])
      expect(second).toEqual(first)
    })
  })

  describe('empty inputs', () => {
    it('reports nothing for three empty inputs', () => {
      expect(auditUnityReferences([], [], [])).toEqual({
        findings: [],
        hasErrors: false,
        hasWarnings: false,
      })
    })

    it('reports nothing for a scene with empty text', () => {
      const result = auditUnityReferences(
        [{ scenePath: 'Assets/Empty.unity', text: '' }],
        [KNOWN_SCRIPT],
        ['Assets/Empty.unity'],
      )
      expect(result.findings).toEqual([])
      expect(result.hasErrors).toBe(false)
      expect(result.hasWarnings).toBe(false)
    })
  })

  describe('immutability', () => {
    it('leaves frozen inputs untouched and derives every finding from them', () => {
      const observed = Object.freeze([
        Object.freeze(scene('Assets/Scenes/Level.unity', [
          `  m_Script: {fileID: 11500000, guid: ${MISSING_SCRIPT}, type: 3}`,
          '  m_Gone: "Assets/Art/Gone.png"',
        ])),
      ])
      const knownGuids = Object.freeze([` ${KNOWN_SCRIPT.toUpperCase()} `])
      const observedPaths = Object.freeze(['Assets\\Art\\Gone.png'])
      const before = JSON.stringify([observed, knownGuids, observedPaths])
      const result = auditUnityReferences(observed, knownGuids, observedPaths)
      expect(JSON.stringify([observed, knownGuids, observedPaths])).toBe(before)
      expect(result.findings.map(finding => finding.category)).toEqual(['missing-script'])
    })
  })

  describe('UnityDiagnostic fields', () => {
    it('carries every UnityDiagnostic field on each finding', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          `  m_Script: {fileID: 11500000, guid: ${MISSING_SCRIPT}, type: 3}`,
        ])],
        [],
        [],
      )
      const finding: UnityReferenceFinding | undefined = result.findings[0]
      expect(finding).toEqual({
        severity: 'error',
        category: 'missing-script',
        message: `m_Script references GUID ${MISSING_SCRIPT}, which is absent from the known GUID set.`,
        file: 'Assets/Scenes/Level.unity',
        suggestion: 'Restore the script asset so its GUID resolves, or remove the component.',
        line: 1,
      })
      const diagnostic: UnityDiagnostic | undefined = finding
      expect(diagnostic?.severity).toBe('error')
      expect(diagnostic?.category).toBe('missing-script')
      expect(diagnostic?.file).toBe('Assets/Scenes/Level.unity')
      expect(diagnostic?.message).toContain('m_Script references GUID')
      expect(diagnostic?.suggestion).toContain('remove the component')
    })
  })

  describe('composition with sibling GUID collection', () => {
    it('accepts the known GUID set that collectGuids reads from .meta texts', () => {
      const knownGuids = collectGuids([
        { path: 'Assets/Scripts/Player.cs.meta', content: `fileFormatVersion: 2\nguid: ${KNOWN_SCRIPT}\n` },
        { path: 'Assets/Textures/Hero.png.meta', content: `fileFormatVersion: 2\nguid: ${KNOWN_ASSET}\n` },
      ]).map(entry => entry.guid)
      const observed = [scene('Assets/Scenes/Level.unity', [
        `  m_Script: {fileID: 11500000, guid: ${KNOWN_SCRIPT}, type: 3}`,
        `  m_Texture: {fileID: 2800000, guid: ${KNOWN_ASSET}, type: 3}`,
        '  m_Scene: "Assets/Scenes/Level.unity"',
      ])]
      const clean = auditUnityReferences(observed, knownGuids, ['Assets/Scenes/Level.unity'])
      expect(clean.findings).toEqual([])
      expect(clean.hasErrors).toBe(false)
      expect(clean.hasWarnings).toBe(false)
      const incomplete = auditUnityReferences(observed, knownGuids.slice(0, 1), ['Assets/Scenes/Level.unity'])
      expect(triples(incomplete.findings)).toEqual([
        ['Assets/Scenes/Level.unity', 2, 'unresolved-guid'],
      ])
    })
  })

  describe('mixed findings', () => {
    it('sets both flags and orders one scene by line number', () => {
      const result = auditUnityReferences(
        [scene('Assets/Scenes/Level.unity', [
          '%YAML 1.1',
          '--- !u!1 &100000',
          'GameObject:',
          '  m_Name: Level',
          '--- !u!114 &200000',
          'MonoBehaviour:',
          `  m_Script: {fileID: 11500000, guid: ${MISSING_SCRIPT}, type: 3}`,
          `  m_Material: {fileID: 2100000, guid: ${MISSING_GUID}, type: 3}`,
          '  m_PrefabPath: "Assets/Prefabs/Gone.prefab"',
        ])],
        [KNOWN_ASSET],
        ['Assets/Scenes/Level.unity'],
      )
      expect(triples(result.findings)).toEqual([
        ['Assets/Scenes/Level.unity', 7, 'missing-script'],
        ['Assets/Scenes/Level.unity', 8, 'unresolved-guid'],
        ['Assets/Scenes/Level.unity', 9, 'broken-path'],
      ])
      expect(result.hasErrors).toBe(true)
      expect(result.hasWarnings).toBe(true)
    })
  })
})
