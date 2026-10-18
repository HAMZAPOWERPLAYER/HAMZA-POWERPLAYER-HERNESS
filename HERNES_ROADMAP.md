# HERNES Engineering Roadmap

HAMZA POWERPLAYER HERNES is built on the existing DeepSeek Harness (`dsh`)
repository. This document records the verified current state, the completed
reliability toolkit, and the next engineering priorities. It is HERNES-specific
project documentation; upstream Harness documentation still lives under
[`docs/`](docs/).

## Verified current state

- Upstream architecture is unchanged: all-plugin Cordis harness, workspace
  packages under `packages/<group>/<pkg>/`, license MIT with
  [third-party notices](THIRD_PARTY_NOTICES.md) preserved.
- New HERNES capability toolkit lives in `packages/util/values` as 102 pure,
  dependency-free modules (94 from Parts 1–3, 8 added by Part 4) with 105 spec
  files and 2339 executed assertions, all passing (Node-native TypeScript
  execution; see "Verification method").
- Part 3 added the game-development layer: 18 game modules (design spec,
  architecture, movement, AI, UI, horror, assets, animation, mobile, testing,
  performance, vertical slice, multi-agent, knowledge base, Unity/Godot
  diagnostics), then a coverage audit drove 10 more (`game-audio`,
  `game-design-tasks`, `game-lifecycle-audit`, `game-performance-triage`,
  `unity-reference-integrity`, `godot-scene-integrity`, `game-state-sync`,
  `game-reliability`, `game-integration-review`, `game-quality-gate`), and a
  final wave added 3 more (`game-request-router` for §2.2 task-mode routing,
  `unity-codegen` and `godot-codegen` for §5.2/§6.2 skeleton generation) plus
  further §4.4 lifecycle checks; 4 existing modules gained audited capabilities:
  `player-movement` (pause + perspective presets), `game-testing` (check-kind
  taxonomy + visual-evidence rule), `game-knowledge-base` (credential screening
  + source precedence), `interaction-puzzle` (milestone completion now enforces
  its prerequisites), and `mobile-optimization` (measured-vs-estimate tagging).
- No upstream file was rewritten; `packages/util/values/src/index.ts` only
  gained additive re-exports (all 91 modules reachable from the barrel).

## Completed toolkit

| Area | Modules |
|---|---|
| Truth and verification | `verification`, `completion-report`, `test-plan`, `redaction-report` |
| Task lifecycle | `task-state`, `progress-tracker`, `task-planning-engine` |
| Project intelligence | `project-kind`, `workspace-discovery`, `ignore-rules`, `change-summary`, `codebase-understanding` |
| Game and mobile projects | `unity-project-model`, `godot-project-model`, `godot-scene-model`, `godot-export-presets`, `android-manifest-model`, `unity-meta-audit`, `android-gradle-model`, `flutter-pubspec-model`, `flutter-deps`, `unity-csharp-project`, `unity-test-results`, `asset-reference` |
| Model and cost control | `model-capabilities`, `context-budget`, `token-estimate`, `budget-guard`, `rate-limit`, `retry-policy` |
| Failure handling | `error-classification`, `log-digest`, `flaky-test-detector` |
| Performance measurement | `latency-histogram`, `benchmark-protocol` |
| Supply chain | `dependency-pinning`, `license-policy` |
| Security and privacy | `path-safety`, `secret-redaction`, `environment-diagnostics`, `approval-policy`, `tool-risk`, `workspace-trust`, `security-policy`, `security-audit` |
| Contracts and utilities | `config-validation`, `tool-registry-model`, `mcp-tool-model`, `identifier`, `text-truncation`, `command-plan`, `portable-path`, `git-diff-model`, `test-coverage-gate`, `command-safety`, `agent-prompt-model`, `multi-file-edit`, `config-migration` |
| Session and observability | `session-log-redaction`, `test-result-aggregator`, `ini-subset`, `error-memory` |

## Defects found and fixed

Each was found by executing behavior rather than by reading code, and each has a
regression test:

| Defect | Module | Found by |
|---|---|---|
| `../etc` resolved to `root/etc`, escaping the containment root | `path-safety` | Cross-module runtime checks |
| `isTerminalTaskState` had no `@param`/`@returns` | `task-state` | `verify-export-jsdoc` |
| A workspace-root `docs/` directory was not counted as documentation because the check required a preceding slash | `workspace-discovery` | A spec fixture rename that exposed the gap |
| A batch-budget test asserted a boundary the documented greedy rule cannot produce | `token-estimate` spec | Spec run |
| A field doc used the banned origin-label token | `verification` | Applying `verify-concrete-terms` vocabulary manually |
| Two spec fixtures used `docs/*.md` strings that `verify-doc-refs` reads as documentation references | `ignore-rules` spec, `workspace-discovery` spec | `verify-doc-refs` |
| `auditAndroidSdkLevels` required the whole `AndroidManifest`, so a Gradle config had to be projected into a fake manifest | `android-manifest-model` | `tsc -b` on the Gradle module |
| `budget-guard` documented "maximum allowed" while exhausting at `>=` | `budget-guard` | Cross-module lifecycle spec |
| Nested keys of a pubspec dependency (`sdk:`, `git:`, `url:`) were counted as package names | `flutter-pubspec-model` | Spec run |
| The fake `advanceTimersByTimeAsync` did not flush microtasks between timers, so an async polling loop ran a single round | harness shim | `jobs-local/pump.spec.ts` |
| The same INI line loop was duplicated in the Godot project and export-preset readers | `godot-project-model`, `godot-export-presets` | Approximate `jscpd` check |
| `scanIniSubset` had no `@param`/`@returns` | `ini-subset` | `verify-export-jsdoc` |
| `.sln` project GUIDs were stripped of braces by the parsing regex | `unity-csharp-project` | Spec run |
| `parseIgnoreRules` received a string instead of a line array, so it iterated characters | `cross-module-integration` spec | Spec run |
| `resolveAccess` compared absolute trusted roots against a relative target path, so every trusted-root check failed | `security-policy` | Spec run |
| `decideInvocation` returned `decideApproval`'s decision instead of the denied-root `deny` decision | `security-policy` | Spec run |
| `reviseTaskPlan` passed `undefined` dependency arrays from incoming tasks into `every()` | `task-planning-engine` | Spec run |
| `resolveImport` did not strip `./` prefix from relative imports, so imports never resolved | `codebase-understanding` | Spec run |
| `createTaskPlan` always set `completionState` to `not-started`, ignoring caller-supplied states | `task-planning-engine` | Spec run |
| Multi-file-edit `FileChange` and `ObservedFile` names collided with `change-summary` and `codebase-understanding` exports | `multi-file-edit` | `tsc -b` |
| `config-migration` `migrated` property name collided between config object and boolean flag | `config-migration` | `tsc -b` |
| `security-audit` regex missed single-quote shell metacharacter | `security-audit` | Spec run |
| `updateMovement` reported `jumped: true` only in the degenerate no-lift case; a real jump reported `false` | `player-movement` | Part 3 spec run |
| `updateAI` advanced `timeInState` twice per frame while stunned, ending stun after half its configured duration | `enemy-ai` | Part 3 spec run |
| `showScreen` reported success for a screen absent from state, focusing a screen `validateUIState` rejects | `game-ui` | Part 3 spec run |
| `buildAssetInventory` discarded unresolved references, making `missingReferences` unreachable and the missing-reference report dead | `asset-pipeline` | Part 3 spec run |
| `buildAssetInventory` counted an asset quoting its own path as referenced by others, hiding it from `unreferenced` | `asset-pipeline` | Part 3 spec run |
| `createAnimationState` started non-looping clips with `finished: true` and `playing: true` simultaneously | `animation-system` | Part 3 spec run |
| `completeMilestone` ignored `canCompleteMilestone`, allowing skipped objectives and repeated completion (now enforced, messages shared from one source) | `interaction-puzzle` | Part 3 coverage audit + spec run |
| `game-knowledge-base`, `workspace-trust`, and four Part 3 modules were absent from `src/index.ts`, unreachable through the package entry point | `values` barrel | Part 3 coverage audit |
| 247 exported functions across the 18 first-wave Part 3 modules lacked required `@param`/`@returns` JSDoc | 18 Part 3 modules | `verify-export-jsdoc` |
| 58 files in the package ended with no trailing newline | `values` package | Trailing-newline check |

## Verification method

`pnpm install` does not complete in the current offline environment, so the
repository's own Vitest runner and doc-sync aggregate cannot run here. Each
module is verified by:

1. `tsc -b --force` on `packages/util/values` with the repository's strict
   compiler settings (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
   — exit 0.
2. Executing every spec file with Node 26 native TypeScript execution against a
   minimal Vitest-compatible shim (`describe`/`it`/`expect`), reporting
   2339 passed, 0 failed across 105 spec files (including the 99-test
   `partial-json.spec.ts` on the upgraded shim).
3. Loading the built barrel (`lib/types/index.js`) to confirm all 379 exports
   and running 28 independent cross-module checks against that built artifact.

### Repository gates that run in this environment

Nine repo-owned `scripts/verify-*.ts` gates execute with Node 26 and pass:

| Gate | Result |
|---|---|
| `verify-export-jsdoc` | 0 violations in `packages/util/values` |
| `verify-doc-refs` | 4131 files checked, all references resolve |
| `verify-doc-budgets` | 7 budgeted docs within ceiling |
| `verify-package-readme-summaries` | 395 package README summaries within 100 words |
| `verify-package-paths` | 6097 maintained package references resolve |
| `verify-dsh-package-licenses` | 348 packages declare MIT |
| `verify-application-entrypoints` | `dsh` is the only supported Node launcher |
| `verify-config-source-ownership` | no inline environment credentials in shipped configuration |
| `verify-no-top-level-await` | 2585 package source files contain no module-scope await |

Two further gates need a git index this tree lacks, so their rules were applied
to the new files directly: the banned origin-label token appears 0 times, and an
approximation of the `jscpd` settings (`minTokens` 60, `minLines` 6, tests
ignored) reports 0 cross-file clone candidates across the 38 source files. The
approximation was validated against a duplicated file, which it reports.

`verify-export-jsdoc` reports 14 violations in two files this work does not
touch (`packages/client/ui-conversation/src/client/input/editor/text-ref.ts`,
`packages/subagent/subagent-claude-code/src/process.ts`). Both import their
heritage types from external packages (`lexical`,
`@anthropic-ai/claude-agent-sdk`) that cannot resolve without `node_modules`,
so the gate cannot see that the members are heritage-declared and exempt.

Gates still blocked here: `verify-translation-pairing`, `verify-md-links`,
`verify-subsystem-pages`, and `verify-package-readme-limitations` need
`mdast-util-*`; `verify-no-unknown-casts` needs a git index; and
`verify-npm-install-layout` did not finish within seven minutes.

This is behavior evidence for the modules themselves, not proof that the full
repository test suite passes.

## Known limitations

- The modules are not yet wired into the agent loop, tool registry, or boot
  composition.
- `packages/util/values/README.md` does not yet document the new modules; the
  bilingual pairing gate requires `verify-translation-pairing --write`, which
  needs the repository toolchain.
- Game-engine support covers project-file parsing and SDK/permission review
  only; no Unity, Godot, or Android build tooling is invoked.
- CI coverage percentages are unmeasured; the per-file 100% gate is unproven.
- The 14 pre-existing `verify-export-jsdoc` findings described above remain in
  unrelated packages and are not addressed here.
- No benchmark numbers are claimed.

## Part 4: AI orchestration layer (added this session)

Part 4 adds a pure, dependency-free AI orchestration layer on top of the
Parts 1–3 toolkit. All modules are pure TypeScript: they compute results from
caller-supplied input, perform no I/O, hold no mutable state, and never invoke
a model provider directly.

New modules:

- `agent-loop-state` — explicit agent-loop state machine with legal transitions
  (initializing → understanding → planning → gathering-context →
  awaiting-model-response → validating-tool-call → awaiting-approval →
  executing-tool → evaluating-result → verifying → recovering →
  completed/failed/cancelled).
- `execution-budget` — configurable limits for tool calls, retries, elapsed
  time, context tokens, and concurrency, enforced by application code.
- `model-task-classifier` — deterministic task classification into practical
  categories with a safe `general` fallback.
- `model-router` — capability-, privacy-, availability-, and context-aware
  model routing with explicit user-override respect and fallback reporting.
- `context-provenance` — context source tracking (source, range, version,
  retrieval method, observed vs summarized) and stale-context detection.
- `project-memory` — long-running project knowledge with explicit confidence
  levels, invalidation triggers, and credential screening.
- `task-recovery` — partial-success reporting, resumable-step selection, and
  safe-retry guidance for interrupted execution.
- `idempotency` — operation idempotency classification and retry guidance.

All 8 modules have spec files and are re-exported from `src/index.ts`.

## Next engineering priorities

1. Restore the toolchain (`pnpm install`, `pnpm run build`, `pnpm test`) and
   confirm the 100% per-file coverage gate over the new modules.
2. Record the bilingual README pair for `packages/util/values`.
3. Wire `task-state`, `completion-report`, and `project-kind` through documented
   plugin extension points rather than module-level imports.
4. Add engine integrations (Unity batch-mode diagnostics, Godot headless
   checks) as independently testable packages with real-command verification.
