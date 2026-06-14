# Forge v0.3 Usability Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Forge v0.3.x from stabilization into a usable-candidate state with auditable gates, real-task regression evidence, installer smoke evidence, and PR-based integration.

**Architecture:** Keep engineering gates, real-task evidence, and installer smoke evidence as separate modules so each can be reviewed and merged independently. Use the existing `codex/Forge` branch for Codex work, create PRs from that branch, and merge to `main` only after fresh verification and PR checks allow it.

**Tech Stack:** Electron, React, TypeScript, Node.js `node:test`, ESLint flat config, electron-vite, electron-builder, GitHub CLI.

---

## File Structure

- `package.json`: owns npm scripts for v0.3 quality, regression, installer smoke, and usable gates.
- `scripts/run-v0-3-quality-gate.mjs`: chains engineering checks, Built-in Tools QA, Browser QA, and packaging.
- `scripts/run-v0-3-usability-gate.mjs`: validates evidence first, then runs strict evidence gates and engineering gate without rebuilding the installer.
- `scripts/summarize-v0-3-regression-results.mjs`: validates and summarizes real-task regression results.
- `scripts/check-v0-3-installer-smoke.mjs`: validates installer smoke evidence against the actual installer file and SHA-256.
- `scripts/summarize-v0-3-usability-status.mjs`: reports missing, invalid, blocked, or ready usability evidence.
- `tests/v03*.test.ts`: locks v0.3 script behavior and failure modes.
- `docs/V0_3_REGRESSION_TASKS.md`: defines fixed real-task regression tasks and evidence rules.
- `docs/V0_3_REGRESSION_RESULTS.json`: formal real-task evidence file, created only from actual task runs.
- `docs/V0_3_INSTALLER_SMOKE.json`: formal manual installer smoke file, created only after installing and checking the current installer.
- `README.md`, `README.en.md`, `docs/RELEASE.md`, `docs/EXTENSIONS.md`, `AGENTS.md`: user-facing and contributor-facing docs that must stay honest about v0.3.x being stabilization until `npm run quality:v0.3:usable` passes.

## Task 1: v0.3 Gate Migration Review And PR

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/EXTENSIONS.md`
- Modify: `docs/RELEASE.md`
- Modify: `package.json`
- Delete: `scripts/check-v0-2-installer-smoke.mjs`
- Delete: `scripts/run-v0-2-quality-gate.mjs`
- Delete: `scripts/run-v0-2-usability-gate.mjs`
- Delete: `scripts/summarize-v0-2-regression-results.mjs`
- Delete: `scripts/summarize-v0-2-usability-status.mjs`
- Delete: `tests/v02QualityGateScripts.test.ts`
- Delete: `tests/v02RegressionResultsScripts.test.ts`
- Delete: `tests/v02UsabilityGateScripts.test.ts`
- Delete: `tests/v02UsabilityStatusScripts.test.ts`
- Create: `docs/V0_3_INSTALLER_SMOKE.example.json`
- Create: `docs/V0_3_REGRESSION_RESULTS.example.json`
- Create: `docs/V0_3_REGRESSION_TASKS.md`
- Create: `scripts/check-v0-3-installer-smoke.mjs`
- Create: `scripts/run-v0-3-quality-gate.mjs`
- Create: `scripts/run-v0-3-usability-gate.mjs`
- Create: `scripts/summarize-v0-3-regression-results.mjs`
- Create: `scripts/summarize-v0-3-usability-status.mjs`
- Create: `tests/v03QualityGateScripts.test.ts`
- Create: `tests/v03RegressionResultsScripts.test.ts`
- Create: `tests/v03UsabilityGateScripts.test.ts`
- Create: `tests/v03UsabilityStatusScripts.test.ts`
- Create: `docs/superpowers/plans/2026-06-14-v0-3-usability-evidence.md`

- [ ] **Step 1: Inspect current branch and pending changes**

Run:

```powershell
git status --short --branch
git diff --stat
```

Expected: branch is `codex/Forge`; changes are limited to v0.3 gate migration docs, scripts, tests, and this plan.

- [ ] **Step 2: Review script and test wiring**

Run:

```powershell
Select-String -Path .\package.json,.\README.md,.\README.en.md,.\docs\RELEASE.md,.\AGENTS.md -Pattern "v0\.2|v0\.3|V0_2|V0_3|quality:v0\.3|qa:built-in-tools"
```

Expected: active quality scripts and docs point to v0.3 paths; historical v0.2 references remain only where explicitly described as historical evidence.

- [ ] **Step 3: Run fresh verification**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
$env:FORGE_QUALITY_GATE_SKIP_DIST = "true"
npm run quality:v0.3
Remove-Item Env:\FORGE_QUALITY_GATE_SKIP_DIST
npm run quality:v0.3:status
```

Expected: `npm test`, `typecheck`, `lint`, `build`, and skip-dist `quality:v0.3` exit 0. `quality:v0.3:status` exits 0 and reports `unproven` until formal evidence files are created.

- [ ] **Step 4: Commit the migration module**

Run:

```powershell
git status --short --branch
git add AGENTS.md README.md README.en.md docs/EXTENSIONS.md docs/RELEASE.md docs/V0_3_INSTALLER_SMOKE.example.json docs/V0_3_REGRESSION_RESULTS.example.json docs/V0_3_REGRESSION_TASKS.md docs/superpowers/plans/2026-06-14-v0-3-usability-evidence.md package.json scripts tests
git status --short --branch
git commit -m "完善 v0.3 质量门禁"
```

Expected: commit succeeds on `codex/Forge`.

- [ ] **Step 5: Push, create PR, and merge when allowed**

Run:

```powershell
git push -u origin codex/Forge
gh pr create --base main --head codex/Forge --title "完善 v0.3 质量门禁" --body-file .tmp-test\v0-3-gate-pr.md
gh pr checks --watch
gh pr merge --merge --delete-branch=false
```

Expected: PR is non-empty, checks pass, and merge completes. If GitHub permissions or branch protection block merge, record the exact error and keep the PR open.

## Task 2: Real-Task Regression Evidence

**Files:**
- Create: `docs/V0_3_REGRESSION_RESULTS.json`
- Reference: `docs/V0_3_REGRESSION_RESULTS.example.json`
- Reference: `docs/V0_3_REGRESSION_TASKS.md`

- [ ] **Step 1: Run each fixed task as a real task**

Run or manually execute the fixed tasks `S1`, `S2`, `S3`, `S4`, `S5`, `M1`, `M2`, `M3`, `M4`, `M5`, `C1`, `C2`, and `C3` from `docs/V0_3_REGRESSION_TASKS.md`.

Expected: each task produces a truthful record of changed files, first-attempt outcome, validation commands, validation exit codes, and failure recovery outcome.

- [ ] **Step 2: Write the formal regression evidence file**

Create `docs/V0_3_REGRESSION_RESULTS.json` from the example schema and only fill fields with actual task outcomes. Every run must include exactly one `npm run typecheck`, one `npm run build`, and one `npm run lint` validation result after the task modification.

- [ ] **Step 3: Validate regression evidence**

Run:

```powershell
npm run quality:regression
npm run quality:regression:gate
```

Expected: both commands exit 0. If the gate fails, fix only the inaccurate evidence or the real bug identified by the failed task, then rerun the same commands.

- [ ] **Step 4: Commit and PR the regression evidence**

Run:

```powershell
git status --short --branch
git add docs/V0_3_REGRESSION_RESULTS.json
git commit -m "记录 v0.3 真实任务回归证据"
git push -u origin codex/Forge
gh pr create --base main --head codex/Forge --title "记录 v0.3 真实任务回归证据" --body-file .tmp-test\v0-3-regression-evidence-pr.md
gh pr checks --watch
gh pr merge --merge --delete-branch=false
```

Expected: evidence PR is non-empty, checks pass, and merge completes. If branch protection blocks merge, leave PR open with the blocker.

## Task 3: Installer Smoke Evidence

**Files:**
- Create: `docs/V0_3_INSTALLER_SMOKE.json`
- Reference: `docs/V0_3_INSTALLER_SMOKE.example.json`
- Reference: `docs/RELEASE.md`

- [ ] **Step 1: Confirm installer artifact binding**

Run:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\release\Forge-0.3.0-x64-setup.exe
```

Expected: hash matches the installer that will be installed and manually tested.

- [ ] **Step 2: Complete manual installer smoke checks**

Install `release\Forge-0.3.0-x64-setup.exe` on Windows 11 and complete the smoke checklist in `docs/RELEASE.md`: app launches, project opens, file preview works, safe command runs, generated diff accept/reject works, Git status view opens, and high-risk actions require confirmation.

- [ ] **Step 3: Write installer smoke evidence**

Create `docs/V0_3_INSTALLER_SMOKE.json` with the current version, relative installer path, current SHA-256, actual test timestamp, Windows platform, and every required check set according to the manual result.

- [ ] **Step 4: Validate installer evidence**

Run:

```powershell
npm run quality:installer-smoke
```

Expected: command exits 0. If it fails, fix only the evidence field identified by the script or rerun the failed manual check.

- [ ] **Step 5: Commit and PR the installer smoke evidence**

Run:

```powershell
git status --short --branch
git add docs/V0_3_INSTALLER_SMOKE.json
git commit -m "记录 v0.3 安装包烟测证据"
git push -u origin codex/Forge
gh pr create --base main --head codex/Forge --title "记录 v0.3 安装包烟测证据" --body-file .tmp-test\v0-3-installer-smoke-pr.md
gh pr checks --watch
gh pr merge --merge --delete-branch=false
```

Expected: installer smoke PR is non-empty, checks pass, and merge completes. If manual smoke fails, do not create passing evidence.

## Task 4: Usable-Candidate Gate

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/RELEASE.md`
- Reference: `docs/V0_3_REGRESSION_RESULTS.json`
- Reference: `docs/V0_3_INSTALLER_SMOKE.json`

- [ ] **Step 1: Run the strict usable gate**

Run:

```powershell
npm run quality:v0.3:usable
```

Expected: command exits 0 only after regression evidence, installer smoke evidence, and engineering gates pass.

- [ ] **Step 2: Update docs only if the usable gate passes**

If and only if `npm run quality:v0.3:usable` exits 0, update README wording from stabilization-only to usable-candidate wording while preserving limitations such as unsigned Windows installer and disabled-by-default browser OAuth.

- [ ] **Step 3: Verify docs and gates**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run quality:v0.3:usable
```

Expected: every command exits 0.

- [ ] **Step 4: Commit and PR the usable-candidate docs**

Run:

```powershell
git status --short --branch
git add README.md README.en.md docs/RELEASE.md
git commit -m "标记 v0.3 可用级候选"
git push -u origin codex/Forge
gh pr create --base main --head codex/Forge --title "标记 v0.3 可用级候选" --body-file .tmp-test\v0-3-usable-candidate-pr.md
gh pr checks --watch
gh pr merge --merge --delete-branch=false
```

Expected: PR merges only after the strict usable gate and PR checks pass.

## Self-Review

- Spec coverage: The plan covers the current v0.3 gate migration, formal real-task evidence, manual installer smoke evidence, and final usable-candidate gate.
- Placeholder scan: Evidence files require actual task and smoke outcomes; the plan explicitly forbids fabricated evidence and defines the commands that must validate each file.
- Type consistency: Script names match `package.json`: `quality:v0.3`, `quality:v0.3:status`, `quality:v0.3:usable`, `quality:regression`, `quality:regression:gate`, and `quality:installer-smoke`.
