# Forge v0.2.x Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize Forge v0.2.x into a usable local AI Coding Agent by prioritizing bug fixes, safety, measurement, and release reliability over new features.

**Architecture:** Keep the current Electron, React, TypeScript, and Built-in Tools architecture intact. Treat v0.2.x as a stabilization line: every change must improve measured task reliability, tool safety, validation pass rate, packaging confidence, or user recovery from failure.

**Tech Stack:** Electron, electron-vite, React, TypeScript, ESLint, Node.js test runner, electron-builder, Forge Built-in Tools QA.

---

## Current Evidence Baseline

This baseline was collected on 2026-06-05 on branch `codex/Forge`.

- `npm test`: 88 tests passed, 0 failed.
- `npm run release:check`: ESLint, typecheck, and Electron/Vite build passed.
- `npm run qa:built-in-tools`: 76 scenarios total, 74 succeeded, 2 skipped browser scenarios, 0 failed, 100% attempted success rate, P0 error rate 0%, write-before-confirmation failures 0.
- `npm run qa:built-in-tools:browser`: 80 scenarios total, 80 succeeded, 0 skipped, 0 failed, browser screenshot and console checks succeeded.
- `npm run dist:win`: generated `release\Forge-0.2.0-x64-setup.exe`.
- `npm run quality:metrics`: added as the local metric snapshot review entry point. When no `agent-quality-metrics.json` exists, it reports missing and keeps real task metrics unproven.
- `npm run quality:regression`: added as the manual v0.2.x regression result review entry point. When no regression results file exists, it reports missing and keeps real task regression metrics unproven.
- `npm run quality:regression:gate`: added as the strict real-task regression usability gate. Missing result files, malformed report shape, missing or mismatched `forgeVersion`, incomplete S1-S5/M1-M5/C1-C3 coverage, unexpected task IDs, duplicate task IDs, invalid runs, missing or duplicated validation kinds, zero-denominator regression metrics, or below-usable regression metrics fail the gate.
- `npm run quality:installer-smoke`: added as the Windows installer manual smoke report gate. Missing `docs\V0_2_INSTALLER_SMOKE.json`, malformed report shape, missing metadata, missing or mismatched `forgeVersion`, invalid `testedAt` or `platform` metadata, missing installer artifact, missing checks, failed checks, an installer filename that does not match the current package version, or an installer SHA-256 that does not match the current artifact fail the gate.
- `npm run quality:v0.2:status`: added as the quick usability evidence status summary. It does not run packaging and currently reports `unproven` with blockers `regression-results-missing` and `installer-smoke-missing`.
- `npm run quality:v0.2:usable`: added as the top-level usability gate. It fails fast through `quality:regression:gate` and `quality:installer-smoke` before running the longer `quality:v0.2` engineering and packaging gate.
- Packaging warnings to track: electron-builder reported duplicate dependency references, and Node emitted `DEP0190` for child process shell arguments.
- Missing evidence: no local `agent-quality-metrics.json` snapshot, no complete `docs/V0_2_REGRESSION_RESULTS.json` fixed-task result set, and no `docs\V0_2_INSTALLER_SMOKE.json` manual installer smoke report were found, so real simple, medium, and complex task first-pass completion rates plus installer smoke confidence are not yet proven.

## Quality Gates For v0.2.x

The authoritative metric definitions live in `src/shared/agentQualityMetrics.ts`.

Before calling a v0.2.x build usable, collect current evidence for these gates:

- Tool call success rate: at least 98% for usable level.
- P0 tool error rate: at most 2% for usable level.
- Simple task first-pass completion rate: at least 85% for usable level.
- Medium task first-pass completion rate: at least 70% for usable level.
- Complex task first-pass completion rate: at least 45% for usable level.
- Post-modification typecheck pass rate: at least 90% for usable level.
- Post-modification build pass rate: at least 85% for usable level.
- Post-modification lint pass rate: at least 85% for usable level.
- Wrong file modification rate: at most 8% for usable level.
- Unrelated code change rate: at most 10% for usable level.
- High-risk operation misfire rate: exactly 0%.
- Write-before-confirmation rate: exactly 0%.
- Failure recovery rate: at least 80% for usable level.

Do not claim a metric is usable when its denominator is 0 or missing. Mark it as unproven and add a measurement task.

### Task 1: Stabilization Docs Baseline

**Files:**
- Create: `docs/superpowers/plans/2026-06-05-v0-2-stabilization.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Update README current status**

Change the status section to state that Forge is in the v0.2.x stabilization line. The text must say that core workflows and Built-in Tools QA are passing, while real task completion metrics still need ongoing samples.

- [x] **Step 2: Update English README status**

Mirror the same status in English. Include `npm run qa:built-in-tools` and `npm run qa:built-in-tools:browser` in the checks list so the English README matches the Chinese README.

- [x] **Step 3: Update release examples to v0.2.0**

Change sample installer and GitHub Release commands in `docs/RELEASE.md` from older minor-version examples to v0.2.0.

- [x] **Step 4: Verify documentation references**

Run:

```powershell
rg -n "0\.1\.0|0\.1\.x" README.md README.en.md docs/RELEASE.md docs/AGENT_RUNTIME.md docs/EXTENSIONS.md docs/PERFORMANCE.md
```

Expected: no stale older minor-version references remain in user-facing v0.2.x release docs.

### Task 2: Real Task Metric Capture Audit

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/shared/agentQualityMetrics.ts`
- Modify: `tests/agentQualityMetrics.test.ts`
- Modify: `tests/builtInToolIpc.test.ts`

- [x] **Step 1: Confirm all metric observation types have runtime producers**

Run:

```powershell
rg -n "kind: \"tool_call\"|kind: \"task_outcome\"|kind: \"validation_run\"|kind: \"file_modification\"|kind: \"failure_recovery\"" src tests
```

Expected: `tool_call` is produced in the Built-in Tool registry, and the other four observation kinds are produced from renderer runtime events.

- [x] **Step 2: Add regression coverage for denominator handling**

Add tests in `tests/agentQualityMetrics.test.ts` that assert metrics with zero denominator return `value: null`, `mvpPassed: null`, `usablePassed: null`, and `excellentPassed: null`.

Use this exact test shape:

```ts
test("agent quality metrics keep empty denominators unproven", () => {
  const snapshot = createAgentQualityMetricSnapshot([], createdAt);
  const metricIds = [
    "toolCallSuccessRate",
    "simpleTaskFirstPassCompletionRate",
    "mediumTaskFirstPassCompletionRate",
    "complexTaskFirstPassCompletionRate",
    "postModificationTypecheckPassRate",
    "postModificationBuildPassRate",
    "postModificationLintPassRate",
    "wrongFileModificationRate",
    "unrelatedCodeChangeRate",
    "failureRecoveryRate"
  ] as const;

  for (const metricId of metricIds) {
    const metricValue = getAgentQualityMetricValue(snapshot, metricId);

    assert.equal(metricValue.denominator, 0);
    assert.equal(metricValue.value, null);
    assert.equal(metricValue.mvpPassed, null);
    assert.equal(metricValue.usablePassed, null);
    assert.equal(metricValue.excellentPassed, null);
  }
});
```

- [x] **Step 3: Add regression coverage for mixed task outcomes**

Add tests for simple, medium, and complex task outcomes that verify first-pass completion rates independently.

Use this exact test shape:

```ts
test("agent quality metrics calculate task complexity buckets independently", () => {
  const snapshot = createAgentQualityMetricSnapshot([
    { kind: "task_outcome", createdAt, complexity: "simple", completedInFirstAttempt: true },
    { kind: "task_outcome", createdAt, complexity: "simple", completedInFirstAttempt: false },
    { kind: "task_outcome", createdAt, complexity: "medium", completedInFirstAttempt: true },
    { kind: "task_outcome", createdAt, complexity: "complex", completedInFirstAttempt: false }
  ]);

  assert.equal(getAgentQualityMetricValue(snapshot, "simpleTaskFirstPassCompletionRate").value, 0.5);
  assert.equal(getAgentQualityMetricValue(snapshot, "mediumTaskFirstPassCompletionRate").value, 1);
  assert.equal(getAgentQualityMetricValue(snapshot, "complexTaskFirstPassCompletionRate").value, 0);
});
```

- [x] **Step 4: Run targeted tests**

Run:

```powershell
npm run test:compile
node --test .tmp-test/tests/agentQualityMetrics.test.js .tmp-test/tests/builtInToolIpc.test.js
```

Expected: targeted tests pass with 0 failures.

- [x] **Step 5: Run full tests**

Run:

```powershell
npm test
```

Expected: all tests pass with 0 failures.

### Task 3: Development QA Summary Artifact

**Files:**
- Create: `scripts/run-v0-2-quality-gate.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README.en.md`

- [x] **Step 1: Add quality gate script**

Create `scripts/run-v0-2-quality-gate.mjs`. It must run or clearly summarize these commands and preserve non-zero exit codes:

```powershell
npm test
npm run release:check
npm run qa:built-in-tools
npm run qa:built-in-tools:browser
npm run dist:win
```

The script must print a compact summary with command, status, duration, and any known warning labels. It must not upload artifacts, delete user files, or push Git state.

Use this script structure:

```js
import { spawn } from "node:child_process";

const commands = [
  ["npm", ["test"]],
  ["npm", ["run", "release:check"]],
  ["npm", ["run", "qa:built-in-tools"]],
  ["npm", ["run", "qa:built-in-tools:browser"]],
  ["npm", ["run", "dist:win"]]
];

const results = [];

for (const [command, args] of commands) {
  const startedAt = Date.now();
  const code = await run(command, args);
  results.push({ command: [command, ...args].join(" "), code, durationMs: Date.now() - startedAt });

  if (code !== 0) {
    break;
  }
}

for (const result of results) {
  console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${result.command} ${result.durationMs}ms`);
}

process.exitCode = results.some((result) => result.code !== 0) ? 1 : 0;

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: "inherit", windowsHide: true });

    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
```

- [x] **Step 2: Add npm script**

Add this script to `package.json`:

```json
"quality:v0.2": "node scripts/run-v0-2-quality-gate.mjs"
```

- [x] **Step 3: Document the gate**

Add `npm run quality:v0.2` to both README check sections. State that it is for release-candidate verification and may take longer because it includes installer packaging.

- [x] **Step 4: Run the new gate**

Run:

```powershell
npm run quality:v0.2
```

Expected: the command exits 0 only when all included checks pass.

### Task 4: Packaging Warning Triage

**Files:**
- Inspect: `package.json`
- Inspect: `package-lock.json`
- Inspect: `scripts/run-built-in-tool-browser-qa.mjs`
- Inspect: `scripts/electron-built-in-tool-browser-qa.mjs`
- Modify files only after identifying the exact warning source.

- [x] **Step 1: Reproduce packaging warnings**

Run:

```powershell
npm run dist:win
```

Expected: packaging succeeds. Capture whether duplicate dependency references and `DEP0190` still appear.

- [x] **Step 2: Locate shell-spawn call sites**

Run:

```powershell
rg -n "shell:\s*true|spawn\(|exec\(|execFile\(" src scripts
```

Expected: list exact call sites before changing any command execution code.

- [x] **Step 3: Fix only confirmed warning source**

If the warning comes from Forge-owned code, replace shell-based child process execution with argument-array execution. If it comes from electron-builder internals, document it in `docs/RELEASE.md` as a known packaging warning and do not patch unrelated code.

- [x] **Step 4: Re-run packaging**

Run:

```powershell
npm run dist:win
```

Expected: installer generation still succeeds. The warning is either resolved or documented as external.

### Task 5: Real Task Regression Set

**Files:**
- Create: `docs/V0_2_REGRESSION_TASKS.md`
- Modify: `README.md`
- Modify: `README.en.md`

- [x] **Step 1: Define simple task set**

Add at least five simple tasks that require one or two file reads, at most one small edit, and one validation command.

- [x] **Step 2: Define medium task set**

Add at least five medium tasks that require multiple files, one focused edit, and one or more validation commands.

- [x] **Step 3: Define complex task set**

Add at least three complex tasks that require planning, multiple files, failure recovery potential, and post-modification verification.

- [x] **Step 4: Define scoring rules**

Each task entry must include expected scope, allowed files, validation command, first-pass success rule, wrong-file rule, unrelated-change rule, and recovery rule.

- [x] **Step 5: Link the regression set**

Link `docs/V0_2_REGRESSION_TASKS.md` from both README files.

### Task 6: v0.2.x Completion Review

**Files:**
- Inspect: `src/shared/agentQualityMetrics.ts`
- Inspect: `src/main/builtInTools/builtInToolQaRunner.ts`
- Inspect: `docs/V0_2_REGRESSION_TASKS.md`
- Inspect: `release/Forge-0.2.0-x64-setup.exe`

- [x] **Step 1: Collect current metric snapshot**

Use Forge's Built-in Tools metrics UI, the stored `agent-quality-metrics.json` file, `npm run quality:metrics`, or `npm run quality:regression` to collect the latest snapshot. If the file is absent, record the metrics as unproven.

- [x] **Step 2: Run release gates**

Run:

```powershell
npm test
npm run release:check
npm run qa:built-in-tools
npm run qa:built-in-tools:browser
npm run dist:win
```

Expected: every command exits 0.

Current evidence: `npm run quality:v0.2` passed on 2026-06-05. It ran `npm test`, `npm run release:check`, `npm run qa:built-in-tools`, `npm run qa:built-in-tools:browser`, and `npm run dist:win`. Packaging still reports the documented duplicate dependency and `DEP0190` warnings.

Additional current evidence: `npm test` passed 86/86 and `npm run release:check` passed on 2026-06-05 after adding the strict regression and installer smoke gate checks.

Latest current evidence: `npm run quality:v0.2` passed again on 2026-06-05 after adding evidence templates. The generated Windows installer was `release\Forge-0.2.0-x64-setup.exe` with size 144,328,757 bytes. Packaging still reports `duplicate-dependencies` and `dep0190-shell-args` warnings, both already tracked as known packaging warnings.

Latest status evidence: `npm run quality:v0.2:status -- --json` reports classification `unproven`, with blockers `regression-results-missing` and `installer-smoke-missing`. `npm test` passed 88/88 after adding the status summary script.

Latest reviewability progress: the Built-in Tools UI now renders all 13 agent quality metrics for review, including numerator, denominator, value, and MVP/usable/excellent tier status for each metric. This improves local metric review, but it does not replace the missing formal regression and installer smoke evidence.

Latest regression evidence hardening: strict v0.2 regression reports now require each validation result to record the actual command and exit code, and `passed` must match whether the exit code is 0. This prevents unchecked typecheck/build/lint claims from being accepted as formal usability evidence, but it does not create the missing real regression report.

Latest installer evidence hardening: installer smoke reports now require `installerSha256`, and `npm run quality:installer-smoke` verifies it against the current installer artifact. This binds manual smoke evidence to the exact tested package, but it does not create the missing manual installer smoke report.

Latest regression recovery improvement: invalid v0.2 regression runs now include `invalidRuns[].reasons`, so malformed evidence points to exact fields such as `validations.command`, `validations.exitCode`, or `validations.passedExitCodeMismatch`. This makes manual evidence cleanup repeatable, but it does not create the missing real regression report.

Latest fixed-task evidence hardening: strict v0.2 regression reports now require fixed task IDs to match their complexity buckets, so S1-S5 must be `simple`, M1-M5 must be `medium`, and C1-C3 must be `complex`. Mismatches are rejected as `complexityForTaskId`, preventing incorrectly categorized samples from inflating or deflating the usable-level task metrics.

Latest installer metadata hardening: installer smoke reports now require `testedAt` to be a timezone-qualified ISO timestamp and `platform` to explicitly start with Windows. This prevents ambiguous dates and negated platform text such as `not Windows` from being accepted as usable evidence.

Latest installer timestamp hardening: installer smoke reports now also reject future `testedAt` values. Manual smoke evidence must describe an already completed test run, not a pre-filled or scheduled future timestamp.

Latest installer path hardening: installer smoke reports now require `installerPath` to be the current workspace relative `release/Forge-<version>-x64-setup.exe` artifact. A same-named installer outside the current release directory can no longer satisfy the smoke evidence gate.

Latest regression timestamp hardening: each v0.2 regression run now requires a timezone-qualified ISO `createdAt`. The summary script no longer silently replaces missing run timestamps with the report generation time, so real-task evidence remains auditable per sample.

Latest regression future timestamp hardening: strict v0.2 regression reports now also reject future `createdAt` values. Fixed-task evidence must describe an already completed run, not a pre-filled or scheduled future result.

Latest first-pass evidence hardening: strict v0.2 regression reports now reject runs where `completedInFirstAttempt` is `true` but any recorded validation failed. This prevents first-pass completion metrics from being inflated by samples that still failed typecheck, build, or lint.

Latest recovery evidence hardening: strict v0.2 regression reports now reject `failureRecovered` booleans on once-completed runs whose validations all passed. Recovery-rate denominators must come from tasks with an actual non-first-pass or failed path, not from clean first-pass successes.

Latest validation coverage hardening: strict v0.2 regression reports now reject runs that do not record all three post-modification validation kinds: `typecheck`, `build`, and `lint`. This prevents a tiny subset of validation samples from making the release look more stable than the fixed task set actually proved.

Latest validation cardinality hardening: strict v0.2 regression reports now also reject duplicated validation kinds inside a run, such as two `lint` records. Each fixed task must contribute exactly one typecheck, one build, and one lint sample, keeping validation denominators aligned with the task set.

Latest installer version binding hardening: installer smoke reports now require `forgeVersion` to match the current `package.json` version, in addition to the installer filename and SHA-256 checks. This makes manual smoke evidence explicitly tied to the released Forge version under review.

Latest status blocker classification hardening: `npm run quality:v0.2:status` now classifies invalid regression evidence separately from below-usable metrics, and invalid installer smoke evidence separately from failed manual smoke checks. This makes the fast status command more useful for deciding whether to fix report shape/metadata first or rerun real tasks/manual smoke flows.

Latest status review detail hardening: `npm run quality:v0.2:status` now prints text detail sections, and `npm run quality:v0.2:status -- --json` includes `regression.details` and `installerSmoke.details`, when evidence files exist but do not pass. These details surface invalid metadata, invalid run counts, duplicate and missing task IDs, blocking metric IDs, failed smoke checks, and installer artifact/SHA status so the next regression pass can repair evidence without re-reading every lower-level command log.

Latest failure recovery denominator hardening: strict v0.2 regression reports now reject non-first-pass runs that leave `failureRecovered` as `null`. Any failed path must explicitly record `true` or `false`, so failure recovery rate evidence cannot disappear from the denominator by omission.

- [ ] **Step 3: Run manual installer smoke test**

Install the current v0.2.x Windows installer from `release`, for example `release\Forge-0.2.0-x64-setup.exe` for package version 0.2.0, and verify these flows manually: app launches, project opens, file preview works, safe command runs, generated diff can be accepted or rejected, Git status view opens, and no high-risk action runs without confirmation.

After the manual check, record the result and the installer SHA-256 in `docs\V0_2_INSTALLER_SMOKE.json` and run:

```powershell
npm run quality:installer-smoke
```

- [ ] **Step 4: Decide release quality honestly**

Classify the release as one of:

- MVP only: tool and packaging gates pass, but real task metrics are missing or below usable level.
- Usable: all usable thresholds with non-zero denominators pass, package builds, and manual smoke test passes.
- Excellent: all excellent thresholds with non-zero denominators pass, package builds, and manual smoke test passes.

Do not label v0.2.x as usable until the real task metric denominators are non-zero and the usable thresholds pass.

For a single final command, run:

```powershell
npm run quality:v0.2:usable
```

Expected: exits 0 only after engineering gates, real-task regression usable thresholds, and installer smoke report all pass.

Current evidence: `npm run quality:v0.2:usable` fails at `npm run quality:regression:gate` because no regression results file exists. The correct current classification remains below usable / unproven, not usable.
