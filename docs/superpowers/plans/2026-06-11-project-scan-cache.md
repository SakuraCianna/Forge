# Project Scan Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Forge project indexing responsiveness by coordinating project scans through a safe main-process cache layer.

**Architecture:** Add a small main-process scan service that wraps the existing scanner and persistent project index cache. It coalesces concurrent scans for the same root, keeps a bounded in-memory previous index for recent projects, and continues to write the existing persistent cache asynchronously.

**Tech Stack:** Electron main process, TypeScript, Node.js `node:test`, npm scripts on Windows PowerShell.

---

## Long-Term Direction

Forge should focus next on local-agent reliability and large-project performance. The durable direction is:

- Keep the project workspace fast on large repositories by caching work that is expensive to rebuild.
- Preserve safety boundaries: sensitive files stay hidden, project paths stay inside the selected root, and stale cache never replaces a fresh filesystem scan.
- Make performance changes measurable through focused regression tests before UI polish or broader refactors.
- Avoid adding heavy dependencies until existing TypeScript and Node primitives are exhausted.

## File Structure

- Create: `src/main/projectScanService.ts`
  - Owns in-flight scan de-duplication and bounded in-memory previous-index reuse.
  - Keeps the existing `scanProjectFiles` behavior unchanged.
- Modify: `src/main/index.ts`
  - Registers project scanning through the new cached service.
- Create: `tests/projectScanService.test.ts`
  - Verifies concurrent scan coalescing, memory previous-index reuse, and cache write failure tolerance.
- Modify: `README.md`
  - Documents that project scanning reuses in-flight and recent scan cache.
- Modify: `README.en.md`
  - Keeps the English README aligned with the Chinese README.

### Task 1: Cached Scan Service

**Files:**
- Create: `src/main/projectScanService.ts`
- Test: `tests/projectScanService.test.ts`

- [x] **Step 1: Add tests for scan coordination**

Create tests that assert these behaviors:

```ts
test("cached project scanner coalesces concurrent scans for the same root", async () => {
  const scanner = createCachedProjectScanner({ cache, scanProjectFiles });
  const firstScan = scanner.scan(projectRoot);
  const secondScan = scanner.scan(projectRoot);
  assert.strictEqual(firstScan, secondScan);
  assert.equal(scanCalls.length, 1);
});

test("cached project scanner reuses the latest in-memory scan as previous index", async () => {
  await scanner.scan(projectRoot);
  await scanner.scan(projectRoot);
  assert.equal(cacheReadCount, 1);
  assert.equal(scanCalls[1]?.previousIndex, firstResult);
});

test("cached project scanner ignores async cache write failures", async () => {
  const result = await scanner.scan(projectRoot);
  assert.equal(result, scanResult);
});
```

- [x] **Step 2: Run the focused test and confirm it fails before implementation**

Run:

```powershell
npm run test:compile
node --test .tmp-test/tests/projectScanService.test.js
```

Expected before implementation: compile fails because `src/main/projectScanService.ts` does not exist.

- [x] **Step 3: Implement `createCachedProjectScanner`**

The service must:

- Return the same promise for concurrent scans of the same `rootPath`.
- Use the latest in-memory scan result as `previousIndex` when available.
- Fall back to `ProjectIndexCache.read(rootPath)` only when memory has no entry.
- Write completed scan results to memory synchronously and persistent cache asynchronously.
- Swallow persistent cache read and write failures, preserving current best-effort cache behavior.
- Keep at most six recent project scan results in memory.

- [x] **Step 4: Run the focused test and confirm it passes**

Run:

```powershell
npm run test:compile
node --test .tmp-test/tests/projectScanService.test.js
```

Expected after implementation: both commands pass.

### Task 2: Main Process Wiring

**Files:**
- Modify: `src/main/index.ts`

- [x] **Step 1: Wire the service into project IPC registration**

Replace the inline project scan callback with a cached scanner instance:

```ts
const cachedProjectScanner = createCachedProjectScanner({
  cache: projectIndexCache,
  scanProjectFiles
});
```

Then register:

```ts
registerProjectHandlers(
  () => pickProjectDirectory(() => dialog.showOpenDialog({ properties: ["openDirectory"] })),
  (rootPath) => cachedProjectScanner.scan(rootPath),
  (channel, handler) => {
    ipcMain.handle(channel, handler);
  }
);
```

- [x] **Step 2: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: typecheck passes.

### Task 3: Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

- [x] **Step 1: Update project workspace performance wording**

Add that project scan requests reuse in-flight scans and recent in-memory indexes while keeping sensitive files hidden.

- [x] **Step 2: Verify docs diff**

Run:

```powershell
git diff -- README.md README.en.md
```

Expected: only the project workspace cache wording changes.

### Task 4: Final Verification

**Files:**
- All modified files

- [x] **Step 1: Run focused test**

```powershell
npm run test:compile
node --test .tmp-test/tests/projectScanService.test.js
```

- [x] **Step 2: Run full automated test suite**

```powershell
npm test
```

- [x] **Step 3: Run typecheck**

```powershell
npm run typecheck
```

- [x] **Step 4: Check final Git status**

```powershell
git status --short --branch
```
