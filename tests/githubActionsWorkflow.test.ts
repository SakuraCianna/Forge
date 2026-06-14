import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("CI/CD workflow runs project checks and uploads Windows installer artifacts", async () => {
  const workflow = await readFile(".github/workflows/ci-cd.yml", "utf8");

  assert.match(workflow, /permissions:\s+contents: read/u);
  assert.match(workflow, /shell: pwsh/u);
  assert.match(workflow, /NODE_VERSION: "24"/u);
  assert.match(workflow, /github\.event\.pull_request\.number \|\| github\.ref/u);
  assert.match(workflow, /runs-on: windows-latest/u);
  assert.match(workflow, /uses: actions\/checkout@v6/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /uses: actions\/setup-node@v6/u);
  assert.match(workflow, /node-version: \$\{\{ env\.NODE_VERSION \}\}/u);
  assert.match(workflow, /cache: npm/u);
  assert.match(workflow, /node --version/u);
  assert.match(workflow, /npm --version/u);
  assert.match(workflow, /run: npm ci/u);
  assert.match(workflow, /run: npm test/u);
  assert.match(workflow, /run: npm run typecheck/u);
  assert.match(workflow, /run: npm run lint/u);
  assert.match(workflow, /run: npm run build/u);
  assert.match(workflow, /startsWith\(github\.ref, 'refs\/tags\/v'\)/u);
  assert.match(workflow, /run: npm run dist:win/u);
  assert.match(workflow, /uses: actions\/upload-artifact@v7/u);
  assert.match(workflow, /name: forge-windows-installer/u);
  assert.match(workflow, /path: release\/\*setup\.exe/u);
  assert.match(workflow, /if-no-files-found: error/u);
});
