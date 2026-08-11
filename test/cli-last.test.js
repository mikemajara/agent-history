import test from "node:test";
import assert from "node:assert/strict";
import { main, resumeLastSession } from "../src/cli.js";

test("--last launches the newest resumable session for this directory", async () => {
  const older = {
    agent: "codex",
    id: "older",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    resumeCommand: ["codex", "resume", "older"],
  };
  const newer = {
    agent: "claude",
    id: "newer",
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    resumeCommand: ["claude", "--resume", "newer"],
  };
  const withoutResume = {
    agent: "cursor",
    id: "missing-resume",
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  };

  let launched;
  const errors = [];
  const exitCode = await resumeLastSession(
    { stderr: { write: (value) => errors.push(value) } },
    {
      getSessionsForCwd: async () => [withoutResume, newer, older],
      launchSession: async (session) => {
        launched = session;
        return 0;
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(launched.id, "newer");
  assert.deepEqual(errors, []);
});

test("--last exits with an error when no resumable sessions exist", async () => {
  const errors = [];
  let launched = false;
  const exitCode = await resumeLastSession(
    { stderr: { write: (value) => errors.push(value) } },
    {
      getSessionsForCwd: async () => [{ agent: "codex", id: "bare" }],
      launchSession: async () => {
        launched = true;
        return 0;
      },
    },
  );

  assert.equal(exitCode, 1);
  assert.equal(launched, false);
  assert.match(errors.join(""), /No resumable sessions found for this directory/);
});

test("main routes --last before path browsing", async () => {
  let called = false;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await main(["--last"], { stdout: { write: () => {} }, stderr: { write: () => {} } }, {
      getSessionsForCwd: async () => [
        {
          agent: "codex",
          id: "latest",
          resumeCommand: ["codex", "resume", "latest"],
        },
      ],
      launchSession: async () => {
        called = true;
        return 0;
      },
    });
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.equal(called, true);
});
