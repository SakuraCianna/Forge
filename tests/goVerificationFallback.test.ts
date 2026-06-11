import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGoCVerificationModuleRoot,
  resolveGoCVerificationFallback
} from "../src/renderer/src/agent/goVerificationFallback.js";

const unsupportedGoCResult = {
  exitCode: 2,
  stdout: "",
  stderr: "flag provided but not defined: -C\nusage: go command [arguments]",
  timedOut: false
};

test("go verification fallback parses generated go -C commands", () => {
  assert.equal(parseGoCVerificationModuleRoot("go -C Backend test ./..."), "Backend");
  assert.equal(
    parseGoCVerificationModuleRoot('go -C "Backend Service" test ./...'),
    "Backend Service"
  );
});

test("go verification fallback rejects unsafe module roots", () => {
  assert.equal(parseGoCVerificationModuleRoot("go -C ../Backend test ./..."), null);
  assert.equal(parseGoCVerificationModuleRoot("go -C C:/Repo/Backend test ./..."), null);
  assert.equal(parseGoCVerificationModuleRoot("go -C /tmp/backend test ./..."), null);
});

test("go verification fallback reruns nested module tests from the module cwd", () => {
  const fallback = resolveGoCVerificationFallback(
    "go -C Backend test ./...",
    unsupportedGoCResult,
    "E:\\CodeHome\\Forge"
  );

  assert.deepEqual(fallback, {
    command: "go test ./...",
    cwd: "E:\\CodeHome\\Forge\\Backend",
    moduleRoot: "Backend"
  });
});

test("go verification fallback only handles unsupported go -C errors", () => {
  assert.equal(
    resolveGoCVerificationFallback(
      "go -C Backend test ./...",
      {
        exitCode: 1,
        stdout: "",
        stderr: "FAIL example/backend",
        timedOut: false
      },
      "E:\\CodeHome\\Forge"
    ),
    null
  );
  assert.equal(
    resolveGoCVerificationFallback("go test ./...", unsupportedGoCResult, "E:\\CodeHome\\Forge"),
    null
  );
});
