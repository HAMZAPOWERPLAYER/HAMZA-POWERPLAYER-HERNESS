import { describe, expect, it } from 'vitest'
import { countInstancedScenes, formatGodotSceneSummary, parseGodotScene } from '../src/godot-scene-model.ts'

describe('parseGodotScene', () => {
  it('reads a realistic scene', () => {
    const text = [
      '[gd_scene load_steps=2 format=3]',
      '',
      '[ext_resource type="Script" path="res://main.gd" id="1"]',
      '',
      '[node name="Main" type="Node2D"]',
      'script = ExtResource("1")',
      '',
      '[node name="Player" parent="." type="CharacterBody2D"]',
      '',
      '[node name="UI" parent="Player" instance=ExtResource("2")]',
      '',
      '[connection signal="body_entered" from="Player" to="." method="_on_body"]',
    ].join('\n')
    const s = parseGodotScene(text)
    expect(s.nodes).toHaveLength(3)
    expect(s.nodes[0].name).toBe('Main')
    expect(s.nodes[0].type).toBe('Node2D')
    expect(s.nodes[0].parent).toBeNull()
    expect(s.nodes[1].parent).toBe('.')
    expect(s.nodes[2].instanced).toBe(true)
    expect(s.resources).toHaveLength(1)
    expect(s.resources[0].id).toBe('1')
    expect(s.connections).toHaveLength(1)
    expect(s.rootNodeNames).toEqual(['Main'])
  })

  it('returns empty collections for empty text', () => {
    const s = parseGodotScene('')
    expect(s.nodes).toEqual([])
    expect(s.resources).toEqual([])
    expect(s.connections).toEqual([])
    expect(s.rootNodeNames).toEqual([])
  })

  it('ignores a node without a name', () => {
    const s = parseGodotScene('[node type="Node"]\n')
    expect(s.nodes).toEqual([])
  })

  it('ignores a connection without a signal', () => {
    const s = parseGodotScene('[connection from="A" to="B" method="x"]\n')
    expect(s.connections).toEqual([])
  })

  it('reads a resource without a type', () => {
    const s = parseGodotScene('[ext_resource path="res://x.png" id="9"]\n')
    expect(s.resources[0].type).toBeNull()
  })
})

describe('countInstancedScenes', () => {
  it('counts only instanced nodes', () => {
    const s = parseGodotScene('[node name="A" instance=ExtResource("1")]\n[node name="B" type="Node"]\n')
    expect(countInstancedScenes(s)).toBe(1)
  })
})

describe('formatGodotSceneSummary', () => {
  it('renders a compact line', () => {
    const s = parseGodotScene('[node name="A" instance=ExtResource("1")]\n[node name="B" type="Node"]\n[ext_resource path="p" id="1"]\n')
    expect(formatGodotSceneSummary(s)).toBe('nodes=2 instanced=1 resources=1 connections=0 roots=2')
  })
})
