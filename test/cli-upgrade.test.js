import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../src/cli.js";
import { upgradePackage } from "../src/lib/upgrade.js";

test("upgradePackage runs npm install -g package@latest", async () => {
  const chunks = [];
  let npmArgs;
  const exitCode = await upgradePackage(
    {
      stdout: { write: (value) => chunks.push(value) },
      stderr: { write: () => {} },
    },
    {
      packageName: "agent-history",
      currentVersion: "0.9.0",
      runNpm: async (args) => {
        npmArgs = args;
        return 0;
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(npmArgs, ["install", "-g", "agent-history@latest"]);
  assert.match(chunks.join(""), /Upgrading agent-history \(currently 0\.9\.0\)/);
  assert.match(chunks.join(""), /Installed agent-history@latest/);
});

test("upgradePackage returns npm failure exit code", async () => {
  const exitCode = await upgradePackage(
    { stdout: { write: () => {} }, stderr: { write: () => {} } },
    {
      runNpm: async () => 7,
    },
  );

  assert.equal(exitCode, 7);
});

test("main routes --upgrade", async () => {
  let npmArgs;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await main(["--upgrade"], { stdout: { write: () => {} }, stderr: { write: () => {} } }, {
      runNpm: async (args) => {
        npmArgs = args;
        return 0;
      },
    });
    assert.equal(process.exitCode, 0);
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.deepEqual(npmArgs, ["install", "-g", "agent-history@latest"]);
});

test("main rejects --upgrade with other arguments", async () => {
  const errors = [];
  let called = false;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await main(["--upgrade", "--refresh"], {
      stdout: { write: () => {} },
      stderr: { write: (value) => errors.push(value) },
    }, {
      runNpm: async () => {
        called = true;
        return 0;
      },
    });
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.equal(called, false);
  assert.match(errors.join(""), /does not accept other arguments/);
});

test("help documents --upgrade", async () => {
  const chunks = [];
  await main(["--help"], {
    stdout: { write: (value) => chunks.push(value) },
    stderr: { write: () => {} },
  });
  assert.match(chunks.join(""), /--upgrade/);
});
