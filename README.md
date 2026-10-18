# HAMZA POWERPLAYER HERNES

English | [中文](README.zh.md)

HERNES (**H**arness-Extended **R**easoning & **N**eural **E**ngineering **S**ystem) is an enterprise-grade AI-assisted game development capability layer built on top of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), the open-source everything-is-a-plugin agent harness powered by [Cordis](https://github.com/cordiverse/cordis).

HERNES transforms DeepSeek Harness into a coherent AI game-development engineer: it understands game ideas, converts them into implementation-ready specifications, inspects Unity/Godot/Flutter/Android projects, designs architecture, generates gameplay systems, validates builds, tests gameplay flows, diagnoses errors, optimizes performance, and reports verifiable results — all through pure, dependency-free TypeScript modules with explicit state machines, bounded execution budgets, permission-checked tool use, and honest uncertainty handling.

> **Developer preview.** HERNES and DeepSeek Harness are iterating rapidly. **There will be compatibility-breaking changes.** Review the [safety notice](SAFETY.md) before running.

---

## What HERNES provides

### Game development toolkit (Parts 1–3)
Project intelligence and gameplay systems implemented as 100+ pure TypeScript modules in `packages/util/values`:

- **Project recognition** — detects Unity, Godot, Flutter, and Android projects from actual project files; reports engine, version, root, build/test/editor tooling, missing dependencies, supported verification operations, and restrictions. Never infers an installed engine from file names alone.
- **Game design specification** — requirements extraction, scope control, design consistency checks, and implementation-ready task generation with dependencies, files/assets, engine APIs, acceptance criteria, and completion state.
- **Architecture generation** — component-based, state-machine, event-driven, data-driven, scene-composition, and modular-service patterns matched to project size; explicit system boundaries and interface contracts.
- **Unity specialist** — project inspection (editor version, package manifest, CSproj/Sln, entry points), meta/asset GUID auditing, reference integrity scanning, NUnit test-result parsing, C# script skeleton generation.
- **Godot specialist** — project config/scene/export-preset parsing, scene-integrity validation, GDScript skeleton generation, export diagnostics.
- **Gameplay systems** — player movement (pause + 4 perspective presets), enemy AI state machine, interaction/puzzle/progression with milestone enforcement, UI/game-flow validation, horror-game reliability checks, audio and animation systems.
- **Asset pipeline** — asset inventory, reference resolution, missing/unreferenced reporting, memory estimation.
- **Mobile optimization** — device-capability assessment, memory/texture budgets, performance triage, Gradle/Android-manifest and Flutter pubspec auditing.
- **Automated testing** — check-kind taxonomy (static/gameplay/build/visual), test-case management, suite aggregation, flaky-test detection, coverage gates, visual-evidence rules.
- **Performance & profiling** — frame-time/CPU/GPU/memory analysis, bottleneck detection, profile comparison, latency histograms, benchmark protocols.
- **Quality gates** — architecture, correctness, security, testing, performance, and maintainability checklist evaluation.
- **Multi-agent coordination** — specialized roles, task contracts, file-ownership conflict detection, independent review, evidence-driven disagreement resolution.

### AI orchestration layer (Part 4)
A controlled, verifiable orchestration engine — not a collection of wrappers:

- **Explicit agent-loop state machine** — `initializing → understanding → planning → gathering-context → awaiting-model-response → validating-tool-call → awaiting-approval → executing-tool → evaluating-result → verifying → recovering → completed/failed/cancelled`, with legal transitions and terminal-state enforcement.
- **Bounded execution budgets** — tool calls, retries, elapsed time, context tokens, and concurrency, enforced in application code (never trusting the model to self-limit).
- **Deterministic model task classification** — routes requests to practical categories with a safe `general` fallback.
- **Capability-aware model routing** — selects providers by required capabilities, availability, privacy/data-sensitivity, and context capacity; respects explicit user selections and reports fallback reasons; never silently routes private data to an unapproved provider.
- **Context engineering** — provenance tracking (source, range, version, retrieval method, observed vs summarized) and stale-context detection before risky edits.
- **Project memory** — long-running knowledge with explicit confidence levels (`verified`/`user-provided`/`observed`/`suggested`/`assumption`), invalidation triggers, and credential screening (secrets never stored).
- **Task recovery & idempotency** — partial-success reporting, resumable-step selection, safe-retry guidance, and idempotency classification.
- **Security** — tool permission checks outside the model, workspace authorization, validated arguments, explicit approval for consequential actions, secret redaction, bounded execution, safe logging.

All modules are **pure**: they compute results from caller-supplied input, perform no I/O, hold no mutable state, and never invoke a model provider directly. The model proposes; the application validates and authorizes; tools perform; verification establishes what happened. A model's generated text is never treated as proof that an operation succeeded.

---

## Repository structure

```
packages/util/values/     HERNES capability toolkit (pure TypeScript modules)
  src/                    102 modules: game dev + AI orchestration
  tests/                  105 spec files, 2339 executed assertions, 0 failed
docs/                     Upstream DeepSeek Harness documentation
scripts/                  Repository verification gates
vendor/                   Vendored Cordis (pinned source copies)
```

HERNES adds only to `packages/util/values`; no upstream DeepSeek Harness file is rewritten. All new modules are additive re-exports from `packages/util/values/src/index.ts`.

---

## Quick start

### Prerequisites
- Node.js `^22.19 || >=24`
- `pnpm` workspace installed

### Install and build
```sh
git clone https://github.com/HAMZAPOWERPLAYER/HAMZA-POWERPLAYER-HERNESS.git
cd HERNESS-HPP
pnpm install
pnpm run build
```

### Run the harness
```sh
# Web UI
pnpm dsh --profile headless "task"

# Headless PTC mode
pnpm run demo:ptc -- "task"
```

> `pnpm dsh --profile ...` is the only supported Node-app launcher. Package bins, demos, and public SDK argv escapes are not supported launch paths.

### Verify the toolkit
```sh
cd packages/util/values
tsc -b --force            # strict typecheck, exit 0
pnpm run test             # 2339 assertions, 0 failed (custom Node-native runner)
```

---

## Architecture

HERNES follows the DeepSeek Harness everything-is-a-plugin model: every contribution goes through `ctx.effect()` / `ctx.on()`, and a registry's `register()` returns the disposer. Capability seams comprise Service Definition / Service Provider / Consumer roles. Typed events use declaration merging. Model-visible inputs must be reconstructable from the session log; new behavior goes on documented extension points rather than loop changes.

See [docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md) for the full architecture and contribution conventions.

---

## Security

- Tool permission checks are enforced outside the model; the model cannot grant itself privileges.
- Workspace authorization and path-containment checks (`path-safety`, `security-policy`) gate all filesystem access.
- Consequential actions require explicit approval; dangerous/non-idempotent operations are not auto-retried without state inspection.
- Secrets are redacted (`secret-redaction`, `environment-diagnostics`) and never stored in project memory or committed configuration.
- Provider routing respects privacy/data-sensitivity restrictions; private project data is never sent to an unapproved provider.

See [SAFETY.md](SAFETY.md) before running.

---

## Verification status

| Check | Result |
|---|---|
| `tsc -b --force` (strict) | exit 0 |
| Spec assertions | 2339 passed, 0 failed |
| Spec files | 105 |
| Pure modules | 102 |
| Trailing newlines | exactly one per file |
| `TODO`/`FIXME`/`XXX` markers | 0 (except intentional codegen templates) |
| `as unknown` casts | 0 |

> Verification here is executed behavior evidence for the modules themselves, not proof that the full repository test suite or CI coverage gate passes in this environment.

---

## Limitations (honest)

- Game-engine support covers **project-file parsing and SDK/permission review only**; no Unity, Godot, or Android build tooling is invoked. Engine installation is never inferred from project files.
- Model routing and classification are pure decision models keyed off caller-supplied capability/availability/privacy data; no model provider is called directly.
- Real-engine execution, recorded-session snapshots, bilingual README pairing, and CI coverage gating require the repository toolchain (`pnpm install`, `pnpm run build`, doc-sync) and are environment-dependent.
- §4.4 runtime destroyed-object / async-race heuristics are deliberately not implemented as static text checks (unsound).

---

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/HAMZAPOWERPLAYER/HAMZA-POWERPLAYER-HERNESS/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{hernes2026,
  title={HAMZA POWERPLAYER HERNES: AI-Assisted Game Development on DeepSeek Harness},
  author={HAMZA POWERPLAYER},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/HAMZAPOWERPLAYER/HAMZA-POWERPLAYER-HERNESS}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
