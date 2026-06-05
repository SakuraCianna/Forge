import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("v0.2 usability gate is wired and exposes a safe dry run", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["quality:installer-smoke"], "node scripts/check-v0-2-installer-smoke.mjs");
  assert.equal(packageJson.scripts?.["quality:v0.2:usable"], "node scripts/run-v0-2-usability-gate.mjs");

  const scriptSource = await readFile("scripts/run-v0-2-usability-gate.mjs", "utf8");

  assert.match(scriptSource, /shell:\s*false/u);
  assert.doesNotMatch(scriptSource, /gh\s+release|git\s+push|Remove-Item|rm\s+-rf/u);

  const { stdout } = await execFileAsync(process.execPath, ["scripts/run-v0-2-usability-gate.mjs"], {
    env: {
      ...process.env,
      FORGE_USABILITY_GATE_DRY_RUN: "true"
    },
    windowsHide: true
  });
  const dryRun = JSON.parse(stdout) as { commands: string[] };

  assert.deepEqual(dryRun.commands, [
    "npm run quality:regression:gate",
    "npm run quality:installer-smoke",
    "npm run quality:v0.2"
  ]);
});

test("v0.2 installer smoke script validates the manual smoke report and installer artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const installerPath = join(releaseDirectory, "Forge-0.2.0-x64-setup.exe");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        installerSha256: createSha256(installerFixture),
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
    {
      cwd: directory,
      windowsHide: true
    }
  );
  const summary = JSON.parse(stdout) as {
    status: string;
    passed: boolean;
    missingChecks: string[];
    failedChecks: string[];
    missingMetadata: string[];
    invalidMetadata: string[];
    installerExists: boolean;
    installerSha256Matches: boolean;
  };

  assert.deepEqual(summary, {
    status: "ok",
    passed: true,
    missingChecks: [],
    failedChecks: [],
    missingMetadata: [],
    invalidMetadata: [],
    installerExists: true,
    installerSha256Matches: true
  });
});

test("v0.2 installer smoke script derives installer name from package version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-version-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const installerPath = join(releaseDirectory, "Forge-0.2.1-x64-setup.exe");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.2.1" }), "utf8");
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.1",
        installerPath: "release/Forge-0.2.1-x64-setup.exe",
        installerSha256: createSha256(installerFixture),
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
    {
      cwd: directory,
      windowsHide: true
    }
  );
  const summary = JSON.parse(stdout) as {
    passed: boolean;
    invalidMetadata: string[];
    installerExists: boolean;
    installerSha256Matches: boolean;
  };

  assert.equal(summary.passed, true);
  assert.deepEqual(summary.invalidMetadata, []);
  assert.equal(summary.installerExists, true);
  assert.equal(summary.installerSha256Matches, true);
});

test("v0.2 installer smoke script fails when report version does not match package version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-version-mismatch-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const installerPath = join(releaseDirectory, "Forge-0.2.0-x64-setup.exe");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.1",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        installerSha256: createSha256(installerFixture),
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
    {
      cwd: directory,
      windowsHide: true
    }
  ).catch((error: unknown) => {
    const maybeError = error as { stdout?: string };

    return { stdout: maybeError.stdout ?? "" };
  });
  const summary = JSON.parse(stdout) as {
    passed: boolean;
    invalidMetadata: string[];
    installerExists: boolean;
    installerSha256Matches: boolean;
  };

  assert.equal(summary.passed, false);
  assert.deepEqual(summary.invalidMetadata, ["forgeVersion"]);
  assert.equal(summary.installerExists, true);
  assert.equal(summary.installerSha256Matches, true);
});

test("v0.2 installer smoke script fails when installer SHA-256 is missing or stale", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-sha-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const installerPath = join(releaseDirectory, "Forge-0.2.0-x64-setup.exe");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(installerPath, "new installer fixture", "utf8");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        installerSha256: createSha256("old installer fixture"),
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout: staleStdout } = await execFileAsync(
    process.execPath,
    [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
    {
      cwd: directory,
      windowsHide: true
    }
  ).catch((error: unknown) => {
    const maybeError = error as { stdout?: string };

    return { stdout: maybeError.stdout ?? "" };
  });
  const staleSummary = JSON.parse(staleStdout) as {
    passed: boolean;
    invalidMetadata: string[];
    installerSha256Matches: boolean;
  };

  assert.equal(staleSummary.passed, false);
  assert.deepEqual(staleSummary.invalidMetadata, ["installerSha256"]);
  assert.equal(staleSummary.installerSha256Matches, false);

  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout: missingStdout } = await execFileAsync(
    process.execPath,
    [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
    {
      cwd: directory,
      windowsHide: true
    }
  ).catch((error: unknown) => {
    const maybeError = error as { stdout?: string };

    return { stdout: maybeError.stdout ?? "" };
  });
  const missingSummary = JSON.parse(missingStdout) as {
    passed: boolean;
    missingMetadata: string[];
    installerSha256Matches: boolean;
  };

  assert.equal(missingSummary.passed, false);
  assert.deepEqual(missingSummary.missingMetadata, ["installerSha256"]);
  assert.equal(missingSummary.installerSha256Matches, false);
});

test("v0.2 installer smoke script fails when required manual checks are missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-missing-"));
  const docsDirectory = join(directory, "docs");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");

  await mkdir(docsDirectory, { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: {
          appLaunches: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    execFileAsync(process.execPath, [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs")], {
      cwd: directory,
      windowsHide: true
    }),
    /Command failed/
  );
});

test("v0.2 installer smoke script fails when report metadata is missing or not Windows", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-metadata-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const installerPath = join(releaseDirectory, "Forge-0.2.0-x64-setup.exe");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(installerPath, "fake installer fixture", "utf8");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        installerSha256: createSha256("fake installer fixture"),
        platform: "Linux",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
    {
      cwd: directory,
      windowsHide: true
    }
  ).catch((error: unknown) => {
    const maybeError = error as { stdout?: string };

    return { stdout: maybeError.stdout ?? "" };
  });
  const summary = JSON.parse(stdout) as {
    status: string;
    passed: boolean;
    missingChecks: string[];
    failedChecks: string[];
    missingMetadata: string[];
    invalidMetadata: string[];
    installerExists: boolean;
  };

  assert.deepEqual(summary, {
    status: "ok",
    passed: false,
    missingChecks: [],
    failedChecks: [],
    missingMetadata: ["testedAt"],
    invalidMetadata: ["platform"],
    installerExists: true,
    installerSha256Matches: true
  });
});

test("v0.2 installer smoke script rejects ambiguous smoke metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-ambiguous-metadata-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const installerPath = join(releaseDirectory, "Forge-0.2.0-x64-setup.exe");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        installerSha256: createSha256(installerFixture),
        testedAt: "2026-06-05",
        platform: "not Windows",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
    {
      cwd: directory,
      windowsHide: true
    }
  ).catch((error: unknown) => {
    const maybeError = error as { stdout?: string };

    return { stdout: maybeError.stdout ?? "" };
  });
  const summary = JSON.parse(stdout) as {
    passed: boolean;
    invalidMetadata: string[];
    installerSha256Matches: boolean;
  };

  assert.equal(summary.passed, false);
  assert.deepEqual(summary.invalidMetadata, ["testedAt", "platform"]);
  assert.equal(summary.installerSha256Matches, true);
});

test("v0.2 installer smoke script rejects malformed report shape", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-installer-smoke-malformed-"));
  const docsDirectory = join(directory, "docs");
  const reportPath = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");

  await mkdir(docsDirectory, { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: "passed"
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    async () => {
      await execFileAsync(
        process.execPath,
        [join(process.cwd(), "scripts", "check-v0-2-installer-smoke.mjs"), "--json"],
        {
          cwd: directory,
          windowsHide: true
        }
      );
    },
    (error: unknown) => {
      const stdout = (error as { stdout?: string }).stdout ?? "";
      const summary = JSON.parse(stdout) as {
        status: string;
        message: string;
      };

      assert.equal(summary.status, "error");
      assert.match(summary.message, /checks object/);

      return true;
    }
  );
});

function createSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
