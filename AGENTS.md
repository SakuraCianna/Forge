# AGENTS.md

Forge: open-source local AI coding agent desktop app (Electron + React + TypeScript). Windows 11 is the primary dev/CI platform; shell is PowerShell.

## Commands

- `npm run dev` — electron-vite dev mode
- `npm test` — compiles tests (`tsconfig.test.json`) into `.tmp-test/`, then runs `node --test .tmp-test/tests/*.test.js`
- Single test: `npm run test:compile && node --test .tmp-test/tests/<name>.test.js`
- `npm run typecheck` — two projects: `tsconfig.node.json` (main/preload/shared) and `tsconfig.web.json` (renderer/shared)
- `npm run lint` — flat-config ESLint
- `npm run build` — runs typecheck first, then electron-vite build
- CI runs in this order: `npm test` -> `typecheck` -> `lint` -> `build` (windows-latest, Node 24). Match it before claiming done.
- `npm run dist:win` — NSIS installer into `release/` (no code signing; `--publish never`). Slow; only when asked.

## Architecture

- `src/main/` — Electron main process. ALL fs, network, Git, command execution, key storage, and extension calls live here behind IPC (`*Ipc.ts` files register channels, `index.ts` wires them).
- `src/preload/` — exposes the `window.forge` API to the renderer. Renderer must never touch fs/net directly; add new capabilities as main-process service + IPC + preload exposure.
- `src/renderer/src/` — React UI, state, i18n. Path aliases `@/*` -> `src/renderer/src/*`, `@shared/*` -> `src/shared/*` (renderer and test tsconfigs only; main process uses relative imports).
- `src/shared/` — types and provider/request logic shared by main and renderer; must typecheck under both tsconfigs.

## Testing quirks

- Tests are `node:test` + `assert/strict`, written in `tests/*.test.ts`, compiled with NodeNext — imports of source files need explicit `.js` extensions (e.g. `../src/renderer/src/state/agentMemory.js`).
- Many tests are meta-tests that assert the literal content of `package.json` scripts, `.github/workflows/ci-cd.yml`, and `scripts/*.mjs` (e.g. `tests/githubActionsWorkflow.test.ts`, `tests/builtInToolQaScripts.test.ts`, `tests/v02QualityGateScripts.test.ts`). Editing npm scripts, the CI workflow, or QA scripts requires updating these tests in the same change.
- `.tmp-test/` is generated output (eslint-ignored). Don't edit or commit content there.

## Conventions

- Every source file starts with a one-line Chinese header comment: `// 本文件说明: ...`. Keep this for new files.
- Commit messages are short Chinese phrases (see `git log`).
- README.md is Chinese, README.en.md is English; user-facing changes usually update both.
- No project `.env`. API keys live in app settings (main-process key vault). Never write keys/tokens into docs, commits, or logs; example configs must not contain real credentials.

## Quality gates and evidence (v0.2.x)

- QA entry points are exactly `npm run qa:built-in-tools` and `npm run qa:built-in-tools:browser` — docs/release notes must use these real script names, never invented aliases.
- `docs/V0_2_REGRESSION_RESULTS.json` and `docs/V0_2_INSTALLER_SMOKE.json` are real evidence files validated by strict gates (`quality:regression:gate`, `quality:installer-smoke`, `quality:v0.2:usable`); the `.example.json` files are templates, not evidence. Never fabricate or hand-edit evidence to make gates pass.
- Until `npm run quality:v0.2:usable` passes, README and release docs must describe v0.2.x as "stabilization phase", not "usable level".
- Built-in tool QA sandbox: set `FORGE_QA_PROJECT_ROOT` (defaults to `.tmp-test/quality-gate-sandbox` in the full gate); browser scenarios are skipped unless `FORGE_QA_BROWSER_PREVIEW_URL` is set.
- Release flow is manual (`docs/RELEASE.md`); CI only uploads an installer artifact on `v*` tags and never auto-releases.
