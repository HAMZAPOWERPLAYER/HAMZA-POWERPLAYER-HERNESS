import { describe, expect, it } from 'vitest'
import {
  auditLifecycleBatch,
  auditScriptLifecycle,
  type ObservedScript,
  type ScriptLanguage,
} from '../src/game-lifecycle-audit.ts'

const CSHARP_UNPAIRED = [
  'class Registrar {',
  '  void Bind(Bus bus) {',
  '    bus.OnHit += HandleHit;',
  '  }',
  '  void HandleHit() { }',
  '}',
].join('\n')

const CSHARP_PAIRED = [
  'class Registrar {',
  '  void Bind(Bus bus) {',
  '    bus.OnHit += HandleHit;',
  '  }',
  '  void Unbind(Bus bus) {',
  '    bus.OnHit -= HandleHit;',
  '  }',
  '  void HandleHit() { }',
  '}',
].join('\n')

const GDSCRIPT_UNPAIRED = [
  'func _ready() -> void:',
  '    button.pressed.connect(_on_pressed)',
  '',
  'func _on_pressed() -> void:',
  '    pass',
].join('\n')

const GDSCRIPT_PAIRED = [
  'func _ready() -> void:',
  '    button.pressed.connect(_on_pressed)',
  '',
  'func _exit_tree() -> void:',
  '    button.pressed.disconnect(_on_pressed)',
  '',
  'func _on_pressed() -> void:',
  '    pass',
].join('\n')

describe('auditScriptLifecycle', () => {
  it('reports a C# subscription with no matching unsubscribe', () => {
    const result = auditScriptLifecycle(CSHARP_UNPAIRED, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([
      {
        id: 'csharp-unpaired-subscription',
        category: 'subscription-pairing',
        severity: 'warning',
        message: "'bus.OnHit += HandleHit' has no matching '-=' unsubscribe in this file",
        line: 3,
        file: 'Registrar.cs',
      },
    ])
  })

  it('stays silent when the C# unsubscribe matches the subscribe', () => {
    const result = auditScriptLifecycle(CSHARP_PAIRED, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([])
  })

  it('reports a GDScript connect with no matching disconnect', () => {
    const result = auditScriptLifecycle(GDSCRIPT_UNPAIRED, 'gdscript', 'player.gd')
    expect(result.findings).toEqual([
      {
        id: 'gdscript-unpaired-connect',
        category: 'subscription-pairing',
        severity: 'warning',
        message: "'button.pressed.connect(_on_pressed)' has no matching 'disconnect' call in this file",
        line: 2,
        file: 'player.gd',
      },
    ])
  })

  it('stays silent when the GDScript disconnect matches the connect', () => {
    const result = auditScriptLifecycle(GDSCRIPT_PAIRED, 'gdscript', 'player.gd')
    expect(result.findings).toEqual([])
  })

  it('reports a C# unsubscribe with no matching subscribe', () => {
    const source = [
      'class Registrar {',
      '  void Unbind(Bus bus) {',
      '    bus.OnHit -= HandleHit;',
      '  }',
      '  void HandleHit() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([
      {
        id: 'unpaired-unsubscribe',
        category: 'subscription-pairing',
        severity: 'warning',
        message: "'bus.OnHit -= HandleHit' has no matching subscription in this file",
        line: 3,
        file: 'Registrar.cs',
      },
    ])
  })

  it('reports a GDScript disconnect with no matching connect', () => {
    const source = ['func _exit_tree() -> void:', '    button.pressed.disconnect(_on_pressed)'].join(
      '\n',
    )
    const result = auditScriptLifecycle(source, 'gdscript', 'player.gd')
    expect(result.findings).toEqual([
      {
        id: 'unpaired-unsubscribe',
        category: 'subscription-pairing',
        severity: 'warning',
        message: "'button.pressed.disconnect(_on_pressed)' has no matching subscription in this file",
        line: 2,
        file: 'player.gd',
      },
    ])
  })

  it('reports a repeated C# subscription of one handler', () => {
    const source = [
      'class Registrar {',
      '  void Bind(Bus bus) {',
      '    bus.OnHit += HandleHit;',
      '    bus.OnHit -= HandleHit;',
      '    bus.OnHit += HandleHit;',
      '    bus.OnHit -= HandleHit;',
      '  }',
      '  void HandleHit() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([
      {
        id: 'duplicate-subscription',
        category: 'duplicate-subscription',
        severity: 'error',
        message:
          "'bus.OnHit += HandleHit' subscribes the same handler a second time; the first subscription is on line 3",
        line: 5,
        file: 'Registrar.cs',
      },
    ])
  })

  it('reports a repeated GDScript connect of one handler', () => {
    const source = [
      'func _ready() -> void:',
      '    button.pressed.connect(_on_pressed)',
      '    button.pressed.disconnect(_on_pressed)',
      '    button.pressed.connect(_on_pressed)',
      '    button.pressed.disconnect(_on_pressed)',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'gdscript', 'player.gd')
    expect(result.findings).toEqual([
      {
        id: 'duplicate-subscription',
        category: 'duplicate-subscription',
        severity: 'error',
        message:
          "'button.pressed.connect(_on_pressed)' subscribes the same handler a second time; the first subscription is on line 2",
        line: 4,
        file: 'player.gd',
      },
    ])
  })

  it('stays silent when the repeated receiver carries two different handlers', () => {
    const source = [
      'class Registrar {',
      '  void Bind(Bus bus) {',
      '    bus.OnHit += HandleHit;',
      '    bus.OnHit -= HandleHit;',
      '    bus.OnHit += HandleOther;',
      '    bus.OnHit -= HandleOther;',
      '  }',
      '  void HandleHit() { }',
      '  void HandleOther() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([])
  })

  it('reports a C# lambda subscription that teardown cannot name', () => {
    const source = [
      'class Registrar {',
      '  void Bind(Bus bus) {',
      '    bus.OnHit += (sender, args) => Notify();',
      '    bus.OnHit -= (sender, args) => Notify();',
      '  }',
      '  void Notify() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([
      {
        id: 'anonymous-subscription',
        category: 'anonymous-subscription',
        severity: 'warning',
        message:
          "'bus.OnHit += (sender, args) => Notify()' is anonymous; keep a reference to the delegate or callable so teardown can unsubscribe it",
        line: 3,
        file: 'Registrar.cs',
      },
    ])
  })

  it('stays silent when the C# handler is a named method', () => {
    const result = auditScriptLifecycle(CSHARP_PAIRED, 'csharp', 'Registrar.cs')
    expect(result.findings.filter((f) => f.id === 'anonymous-subscription')).toEqual([])
  })

  it('reports a GDScript lambda connection that teardown cannot name', () => {
    const source = [
      'func _ready() -> void:',
      '    button.pressed.connect(func(): Notify())',
      '',
      'func _exit_tree() -> void:',
      '    button.pressed.disconnect(func(): Notify())',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'gdscript', 'player.gd')
    expect(result.findings).toEqual([
      {
        id: 'anonymous-subscription',
        category: 'anonymous-subscription',
        severity: 'warning',
        message:
          "'button.pressed.connect(func(): Notify())' is anonymous; keep a reference to the delegate or callable so teardown can unsubscribe it",
        line: 2,
        file: 'player.gd',
      },
    ])
  })

  it('stays silent when the GDScript handler is a named function', () => {
    const result = auditScriptLifecycle(GDSCRIPT_PAIRED, 'gdscript', 'player.gd')
    expect(result.findings.filter((f) => f.id === 'anonymous-subscription')).toEqual([])
  })

  it('reports a C# subscription whose receiver ignores the loop variable', () => {
    const source = [
      'class Registrar {',
      '  void Bind(IReadOnlyList<Player> players) {',
      '    foreach (var p in players) {',
      '      ScoreBus.Changed += Notify;',
      '    }',
      '  }',
      '  void Unbind() {',
      '    ScoreBus.Changed -= Notify;',
      '  }',
      '  void Notify() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([
      {
        id: 'loop-subscription',
        category: 'loop-subscription',
        severity: 'warning',
        message:
          "'ScoreBus.Changed += Notify' subscribes inside a loop body, so the subscription repeats on every iteration",
        line: 4,
        file: 'Registrar.cs',
      },
    ])
  })

  it('stays silent when the C# receiver names the loop variable', () => {
    const source = [
      'class Registrar {',
      '  void Bind(IReadOnlyList<Player> players) {',
      '    foreach (var p in players) {',
      '      p.Changed += Notify;',
      '    }',
      '  }',
      '  void Unbind(Player p) {',
      '    p.Changed -= Notify;',
      '  }',
      '  void Notify() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([])
  })

  it('reports a GDScript connect whose receiver ignores the loop variable', () => {
    const source = [
      'func bind(nodes: Array) -> void:',
      '    for node in nodes:',
      '        score_bus.changed.connect(_on_changed)',
      '',
      'func unbind() -> void:',
      '    score_bus.changed.disconnect(_on_changed)',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'gdscript', 'player.gd')
    expect(result.findings).toEqual([
      {
        id: 'loop-subscription',
        category: 'loop-subscription',
        severity: 'warning',
        message:
          "'score_bus.changed.connect(_on_changed)' subscribes inside a loop body, so the subscription repeats on every iteration",
        line: 3,
        file: 'player.gd',
      },
    ])
  })

  it('stays silent when the GDScript receiver names the loop variable', () => {
    const source = [
      'func bind(nodes: Array) -> void:',
      '    for node in nodes:',
      '        node.pressed.connect(_on_pressed)',
      '',
      'func unbind(nodes: Array) -> void:',
      '    for node in nodes:',
      '        node.pressed.disconnect(_on_pressed)',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'gdscript', 'player.gd')
    expect(result.findings).toEqual([])
  })

  it('rejects an unsupported language', () => {
    const unsupported: string = 'python'
    expect(() => auditScriptLifecycle('print(1)', unsupported as ScriptLanguage, 'tool.py')).toThrow(
      /unsupported language/,
    )
  })

  it('reports nothing for an empty source', () => {
    expect(auditScriptLifecycle('', 'csharp', 'Empty.cs').findings).toEqual([])
    expect(auditScriptLifecycle('', 'gdscript', 'empty.gd').findings).toEqual([])
  })

  it('reports nothing for comment-only sources', () => {
    const csharp = ['// class Registrar {', '  // bus.OnHit += HandleHit;', '// bus.OnHit -= HandleHit;'].join(
      '\n',
    )
    const gdscript = ['# func _ready() -> void:', '    # button.pressed.connect(_on_pressed)'].join(
      '\n',
    )
    expect(auditScriptLifecycle(csharp, 'csharp', 'Notes.cs').findings).toEqual([])
    expect(auditScriptLifecycle(gdscript, 'gdscript', 'notes.gd').findings).toEqual([])
  })

  it('orders two findings on one line by check identifier', () => {
    const source = [
      'class Registrar {',
      '  void Bind(Bus bus) {',
      '    bus.OnHit += (sender, args) => Notify();',
      '  }',
      '  void Notify() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings.map((f) => [f.id, f.line])).toEqual([
      ['anonymous-subscription', 3],
      ['csharp-unpaired-subscription', 3],
    ])
  })

  it('reports a C# async void method', () => {
    const source = [
      'class Worker {',
      '  async void Save() {',
      '    await Persist();',
      '  }',
      '  async Task Persist() { }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Worker.cs')
    expect(result.findings).toEqual([
      {
        id: 'async-void-method',
        category: 'async-void-method',
        severity: 'warning',
        message:
          "'async void Save()' is fire-and-forget; exceptions it throws are unobserved and cannot be awaited",
        line: 2,
        file: 'Worker.cs',
      },
    ])
  })

  it('stays silent for an async Task method', () => {
    const source = [
      'class Worker {',
      '  async Task Save() {',
      '    await Persist();',
      '  }',
      '  async Task Persist() { }',
      '}',
    ].join('\n')
    expect(auditScriptLifecycle(source, 'csharp', 'Worker.cs').findings).toEqual([])
  })

  it('reports a C# allocation inside Update', () => {
    const source = [
      'class Spawner : MonoBehaviour {',
      '  void Update() {',
      '    var items = new List<int>();',
      '  }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Spawner.cs')
    expect(result.findings).toEqual([
      {
        id: 'per-frame-allocation',
        category: 'per-frame-allocation',
        severity: 'warning',
        message:
          "'new' inside per-frame method 'Update' allocates every frame; cache the value in a field or reuse it",
        line: 3,
        file: 'Spawner.cs',
      },
    ])
  })

  it('reports allocations inside FixedUpdate and LateUpdate', () => {
    const source = [
      'class Spawner : MonoBehaviour {',
      '  void FixedUpdate() {',
      '    var a = new List<int>();',
      '  }',
      '  void LateUpdate() {',
      '    var b = new List<int>();',
      '  }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Spawner.cs')
    expect(result.findings.map((f) => [f.id, f.line])).toEqual([
      ['per-frame-allocation', 3],
      ['per-frame-allocation', 6],
    ])
  })

  it('stays silent when the allocation is outside a per-frame method', () => {
    const source = [
      'class Spawner : MonoBehaviour {',
      '  void Update() {',
      '    Build();',
      '  }',
      '  void Build() {',
      '    var items = new List<int>();',
      '  }',
      '}',
    ].join('\n')
    expect(auditScriptLifecycle(source, 'csharp', 'Spawner.cs').findings).toEqual([])
  })

  it('reports a Time.timeScale assignment to zero', () => {
    const source = [
      'class Pauser : MonoBehaviour {',
      '  void Pause() {',
      '    Time.timeScale = 0;',
      '  }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Pauser.cs')
    expect(result.findings).toEqual([
      {
        id: 'time-scale-pause',
        category: 'pause-handling',
        severity: 'info',
        message:
          '`Time.timeScale = 0` pauses the game and needs a matching restore to a non-zero scale; this check cannot verify the restore',
        line: 3,
        file: 'Pauser.cs',
      },
    ])
  })

  it('stays silent when Time.timeScale keeps a non-zero value', () => {
    const source = [
      'class Pauser : MonoBehaviour {',
      '  void Pause() {',
      '    Time.timeScale = 0.5f;',
      '  }',
      '}',
    ].join('\n')
    expect(auditScriptLifecycle(source, 'csharp', 'Pauser.cs').findings).toEqual([])
  })

  it('reports OnEnable without OnDisable', () => {
    const source = [
      'class Registrar : MonoBehaviour {',
      '  void OnEnable() {',
      '    enabled = true;',
      '  }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([
      {
        id: 'unpaired-unity-message',
        category: 'unpaired-unity-message',
        severity: 'warning',
        message: "'OnEnable' is declared without a matching 'OnDisable' in this file",
        line: 2,
        file: 'Registrar.cs',
      },
    ])
  })

  it('stays silent when OnEnable and OnDisable both appear', () => {
    const source = [
      'class Registrar : MonoBehaviour {',
      '  void OnEnable() {',
      '    enabled = true;',
      '  }',
      '  void OnDisable() {',
      '    enabled = false;',
      '  }',
      '}',
    ].join('\n')
    expect(auditScriptLifecycle(source, 'csharp', 'Registrar.cs').findings).toEqual([])
  })

  it('reports OnDisable without OnEnable', () => {
    const source = [
      'class Registrar : MonoBehaviour {',
      '  void OnDisable() {',
      '    enabled = false;',
      '  }',
      '}',
    ].join('\n')
    const result = auditScriptLifecycle(source, 'csharp', 'Registrar.cs')
    expect(result.findings).toEqual([
      {
        id: 'unpaired-unity-message',
        category: 'unpaired-unity-message',
        severity: 'warning',
        message: "'OnDisable' is declared without a matching 'OnEnable' in this file",
        line: 2,
        file: 'Registrar.cs',
      },
    ])
  })
})

describe('auditLifecycleBatch', () => {
  it('totals the findings of every script by severity', () => {
    const scripts: ObservedScript[] = [
      { source: CSHARP_UNPAIRED, language: 'csharp', fileName: 'Registrar.cs' },
      { source: GDSCRIPT_UNPAIRED, language: 'gdscript', fileName: 'player.gd' },
      { source: '', language: 'csharp', fileName: 'Empty.cs' },
    ]
    const batch = auditLifecycleBatch(scripts)
    expect(batch.scriptCount).toBe(3)
    expect(batch.counts).toEqual({ info: 0, warning: 2, error: 0 })
    expect(batch.findings.map((f) => [f.file, f.line])).toEqual([
      ['Registrar.cs', 3],
      ['player.gd', 2],
    ])
  })

  it('counts errors separately from warnings', () => {
    const duplicate = [
      'func _ready() -> void:',
      '    button.pressed.connect(_on_pressed)',
      '    button.pressed.disconnect(_on_pressed)',
      '    button.pressed.connect(_on_pressed)',
      '    button.pressed.disconnect(_on_pressed)',
    ].join('\n')
    const batch = auditLifecycleBatch([
      { source: CSHARP_UNPAIRED, language: 'csharp', fileName: 'Registrar.cs' },
      { source: duplicate, language: 'gdscript', fileName: 'player.gd' },
    ])
    expect(batch.counts).toEqual({ info: 0, warning: 1, error: 1 })
    expect(batch.findings).toHaveLength(2)
  })

  it('keeps scripts in input order ahead of line order', () => {
    const batch = auditLifecycleBatch([
      { source: CSHARP_UNPAIRED, language: 'csharp', fileName: 'Registrar.cs' },
      { source: GDSCRIPT_UNPAIRED, language: 'gdscript', fileName: 'player.gd' },
    ])
    expect(batch.findings.map((f) => [f.file, f.line])).toEqual([
      ['Registrar.cs', 3],
      ['player.gd', 2],
    ])
  })

  it('reports an empty batch', () => {
    expect(auditLifecycleBatch([])).toEqual({
      findings: [],
      scriptCount: 0,
      counts: { info: 0, warning: 0, error: 0 },
    })
  })

  it('leaves its input untouched and returns the same result on a repeat call', () => {
    const scripts: ObservedScript[] = [
      { source: CSHARP_UNPAIRED, language: 'csharp', fileName: 'Registrar.cs' },
    ]
    const snapshot = scripts.map((script) => ({ ...script }))
    const first = auditLifecycleBatch(scripts)
    const second = auditLifecycleBatch(scripts)
    expect(scripts).toEqual(snapshot)
    expect(scripts[0]?.source).toBe(CSHARP_UNPAIRED)
    expect(second.findings).toEqual(first.findings)
    expect(second.counts).toEqual(first.counts)
  })
})
