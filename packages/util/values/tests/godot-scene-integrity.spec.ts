import { describe, expect, it } from 'vitest'
import { validateGodotSceneIntegrity } from '../src/godot-scene-integrity.ts'
import { parseGodotScene } from '../src/godot-scene-model.ts'

function parse(lines: string[]) {
  return parseGodotScene(lines.join('\n'))
}

const compliantScene = parse([
  '[gd_scene load_steps=3 format=3]',
  '',
  '[ext_resource type="Script" path="res://scripts/player.gd" id="1_a"]',
  '[ext_resource type="Texture2D" path="res://art/ship.png" id="2_b"]',
  '',
  '[node name="Main" type="Node2D"]',
  'script = ExtResource("1_a")',
  '',
  '[node name="Player" parent="." type="CharacterBody2D"]',
  '',
  '[node name="Weapon" parent="Player" type="Node2D"]',
  '',
  '[node name="UI" parent="." instance=ExtResource("2_b")]',
  '',
  '[connection signal="body_entered" from="Player" to="." method="_on_body_entered"]',
  '[connection signal="hit" from="Player/Weapon" to="Player" method="_on_weapon_hit"]',
  '[connection signal="pressed" from="UI/StartButton" to="." method="_on_start"]',
])

const compliantPaths = ['scripts/player.gd', 'art/ship.png', 'Main.tscn']

describe('validateGodotSceneIntegrity', () => {
  it('reports no findings for a compliant scene', () => {
    const result = validateGodotSceneIntegrity(compliantScene, compliantPaths)
    expect(result.findings).toEqual([])
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(false)
  })

  it('warns when no nodes were read from an empty scene', () => {
    const result = validateGodotSceneIntegrity(parseGodotScene(''), [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'warning',
      category: 'scene',
      message: 'No nodes were read from the scene text.',
      file: null,
    })
    expect(result.hasWarnings).toBe(true)
    expect(result.hasErrors).toBe(false)
  })

  it('errors when nodes exist but none is the root', () => {
    const scene = parse(['[node name="A" parent="." type="Node"]'])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'node',
      message: 'Scene declares nodes but no root node.',
      file: null,
    })
  })

  it('errors when the scene declares more than one root node', () => {
    const scene = parse(['[node name="A" type="Node"]', '[node name="B" type="Node"]'])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'node',
      message: 'Scene declares 2 root nodes; a scene must declare exactly one root.',
    })
  })
})

describe('validateGodotSceneIntegrity resource paths', () => {
  it('errors when a non-script resource path is not observed', () => {
    const scene = parse([
      '[ext_resource type="Texture2D" path="res://art/ship.png" id="1_a"]',
      '[node name="A" type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, ['other.png'])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'resource',
      message: 'External resource path "res://art/ship.png" was not among the observed files.',
      file: 'res://art/ship.png',
    })
  })

  it('errors with script category when a script resource path is not observed', () => {
    const scene = parse([
      '[ext_resource type="Script" path="res://scripts/player.gd" id="1_a"]',
      '[node name="A" type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, ['art/ship.png'])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'script',
      message: 'External resource path "res://scripts/player.gd" was not among the observed files.',
      file: 'res://scripts/player.gd',
    })
    expect(result.findings[0]!.suggestion).toContain('script file')
  })

  it('matches observed paths across prefix, separator, and case variants', () => {
    const scene = parse([
      '[ext_resource type="Texture2D" path="res://art/ship.png" id="1_a"]',
      '[node name="A" type="Node"]',
    ])
    for (const observed of [
      ['art/ship.png'],
      ['res://art/ship.png'],
      ['./art/ship.png'],
      ['art\\ship.png'],
      ['ART/SHIP.PNG'],
    ]) {
      const result = validateGodotSceneIntegrity(scene, observed)
      expect(result.findings).toEqual([])
    }
  })

  it('errors when a resource declares no path', () => {
    const scene = parse(['[ext_resource type="Script" id="1_a"]', '[node name="A" type="Node"]'])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'resource',
      message: 'External resource "1_a" declares no path.',
      file: null,
    })
  })

  it('reports every declared resource when no paths were observed', () => {
    const scene = parse([
      '[ext_resource type="Script" path="res://scripts/player.gd" id="1_a"]',
      '[ext_resource type="Texture2D" path="res://art/ship.png" id="2_b"]',
      '[node name="A" type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings.map(f => f.category)).toEqual(['script', 'resource'])
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(false)
  })

  it('errors on a duplicate ext_resource id', () => {
    const scene = parse([
      '[ext_resource type="Script" path="res://scripts/a.gd" id="1_a"]',
      '[ext_resource type="Script" path="res://scripts/b.gd" id="1_a"]',
      '[node name="A" type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, ['scripts/a.gd', 'scripts/b.gd'])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'resource',
      message: 'Duplicate ext_resource id "1_a".',
      file: null,
    })
  })

  it('stays silent when ext_resource ids are distinct', () => {
    const scene = parse([
      '[ext_resource type="Script" path="res://scripts/a.gd" id="1_a"]',
      '[ext_resource type="Texture2D" path="res://art/ship.png" id="2_b"]',
      '[node name="A" type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, ['scripts/a.gd', 'art/ship.png'])
    expect(result.findings).toEqual([])
  })
})

describe('validateGodotSceneIntegrity node names', () => {
  it('errors on duplicate names under the scene root', () => {
    const scene = parse([
      '[node name="A" type="Node"]',
      '[node name="Child" parent="." type="Node"]',
      '[node name="Child" parent="." type="Node2D"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'node',
      message: 'Duplicate node name "Child" declared under the scene root.',
      file: null,
    })
  })

  it('errors on duplicate root node names', () => {
    const scene = parse(['[node name="A" type="Node"]', '[node name="A" type="Node2D"]'])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toContainEqual({
      severity: 'error',
      category: 'node',
      message: 'Duplicate node name "A" declared at the scene root.',
      file: null,
      suggestion: 'Give the duplicate nodes distinct names.',
    })
  })

  it('errors on duplicate names under a named parent path', () => {
    const scene = parse([
      '[node name="Root" type="Node"]',
      '[node name="A" parent="." type="Node"]',
      '[node name="X" parent="A" type="Node"]',
      '[node name="X" parent="A" type="Node2D"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'node',
      message: 'Duplicate node name "X" declared under parent path "A".',
    })
  })

  it('allows the same name under different parents', () => {
    const scene = parse([
      '[node name="Root" type="Node"]',
      '[node name="A" parent="." type="Node"]',
      '[node name="X" parent="A" type="Node"]',
      '[node name="X" parent="." type="Node2D"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toEqual([])
  })
})

describe('validateGodotSceneIntegrity parent paths', () => {
  it('errors when a parent path matches no declared node', () => {
    const scene = parse([
      '[node name="A" type="Node"]',
      '[node name="B" parent="Ghost" type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'node',
      message: 'Node "B" declares parent path "Ghost", which matches no declared node.',
      file: null,
    })
  })

  it('accepts declared parents and deeper segments that follow a declared child', () => {
    const scene = parse([
      '[node name="Root" type="Node"]',
      '[node name="A" parent="." type="Node"]',
      '[node name="B" parent="A/Missing" type="Node"]',
      '[node name="C" parent="." type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toEqual([])
  })

  it('accepts parent paths under an instanced node', () => {
    const scene = parse([
      '[node name="A" type="Node"]',
      '[node name="UI" parent="." instance=ExtResource("1_a")]',
      '[node name="Extra" parent="UI/Deep" type="Node"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toEqual([])
  })
})

describe('validateGodotSceneIntegrity connections', () => {
  it('errors for unknown source and target paths in one connection', () => {
    const scene = parse([
      '[node name="A" type="Node"]',
      '[connection signal="boom" from="Ghost" to="Phantom" method="_on_boom"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'connection',
      message: 'Connection "boom" references unknown source node path "Ghost".',
      file: null,
    })
    expect(result.findings[1]).toMatchObject({
      severity: 'error',
      category: 'connection',
      message: 'Connection "boom" references unknown target node path "Phantom".',
    })
  })

  it('errors when an endpoint digs below a declared non-instanced node with no such child', () => {
    const scene = parse([
      '[node name="Root" type="Node"]',
      '[node name="Child" parent="." type="Node"]',
      '[connection signal="s" from="Child/Missing" to="." method="_m"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      category: 'connection',
      message: 'Connection "s" references unknown source node path "Child/Missing".',
    })
  })

  it('rejects the root node name as an endpoint', () => {
    const scene = parse([
      '[node name="Main" type="Node"]',
      '[connection signal="s" from="Main" to="." method="_m"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      category: 'connection',
      message: 'Connection "s" references unknown source node path "Main".',
    })
  })
})

describe('validateGodotSceneIntegrity result flags and ordering', () => {
  it('collects findings in fixed check order and sets the error flag', () => {
    const scene = parse([
      '[ext_resource type="Script" path="res://gone.gd" id="dup"]',
      '[ext_resource type="Texture2D" path="res://also-gone.png" id="dup"]',
      '[node name="Root" type="Node"]',
      '[node name="Child" parent="Nowhere" type="Node"]',
      '[connection signal="boom" from="Ghost" to="." method="_on_boom"]',
    ])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings.map(f => f.category)).toEqual([
      'script',
      'resource',
      'resource',
      'node',
      'connection',
    ])
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(false)
  })

  it('sets both flags when a scene has warnings and errors together', () => {
    const scene = parse(['[ext_resource type="Script" path="res://gone.gd" id="1_a"]'])
    const result = validateGodotSceneIntegrity(scene, [])
    expect(result.findings.map(f => f.category)).toEqual(['scene', 'script'])
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(true)
  })

  it('returns equal results for repeated calls and observed path order does not matter', () => {
    const scene = parse([
      '[ext_resource type="Script" path="res://scripts/a.gd" id="1_a"]',
      '[ext_resource type="Texture2D" path="res://art/missing.png" id="2_b"]',
      '[node name="Root" type="Node"]',
      '[connection signal="s" from="Ghost" to="." method="_m"]',
    ])
    const first = validateGodotSceneIntegrity(scene, ['scripts/a.gd', 'other.tres'])
    const second = validateGodotSceneIntegrity(scene, ['other.tres', 'scripts/a.gd'])
    expect(second).toEqual(first)
    const again = validateGodotSceneIntegrity(scene, ['scripts/a.gd', 'other.tres'])
    expect(again).toEqual(first)
    expect(first.findings.map(f => f.category)).toEqual(['resource', 'connection'])
  })
})

describe('validateGodotSceneIntegrity input immutability', () => {
  it('leaves the scene and observed paths unchanged', () => {
    const scene = parse([
      '[ext_resource type="Script" path="res://gone.gd" id="1_a"]',
      '[node name="A" type="Node"]',
      '[node name="A" type="Node2D"]',
      '[connection signal="s" from="Ghost" to="." method="_m"]',
    ])
    Object.freeze(scene.nodes)
    Object.freeze(scene.resources)
    Object.freeze(scene.connections)
    Object.freeze(scene.rootNodeNames)
    Object.freeze(scene)
    const observed = Object.freeze(['present.png'])
    const before = JSON.stringify(scene)
    const result = validateGodotSceneIntegrity(scene, observed)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(JSON.stringify(scene)).toBe(before)
    expect(observed).toEqual(['present.png'])
  })
})
