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
  let launchOptions;
  const errors = [];
  const exitCode = await resumeLastSession(
    { stderr: { write: (value) => errors.push(value) } },
    {
      getSessionsForCwd: async () => [withoutResume, newer, older],
      launchSession: async (session, _io, options) => {
        launched = session;
        launchOptions = options;
        return 0;
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(launched.id, "newer");
  assert.equal(launchOptions?.mode, "resume");
  assert.deepEqual(errors, []);
});

test("--last --new launches a fresh session with the newest agent", async () => {
  const older = {
    agent: "codex",
    id: "older",
    cwd: "/tmp/project",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    resumeCommand: ["codex", "resume", "older"],
  };
  const newer = {
    agent: "claude",
    id: "newer",
    cwd: "/tmp/project",
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    resumeCommand: ["claude", "--resume", "newer"],
  };

  let launched;
  let launchOptions;
  const exitCode = await resumeLastSession(
    { stderr: { write: () => {} } },
    {
      mode: "new",
      getSessionsForCwd: async () => [newer, older],
      launchSession: async (session, _io, options) => {
        launched = session;
        launchOptions = options;
        return 0;
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(launched.id, "newer");
  assert.equal(launched.agent, "claude");
  assert.equal(launched.cwd, "/tmp/project");
  assert.equal(launchOptions?.mode, "new");
});

test("--last --new fills missing cwd from the target directory", async () => {
  let launched;
  const exitCode = await resumeLastSession(
    { stderr: { write: () => {} } },
    {
      mode: "new",
      getSessionsForCwd: async () => [{ agent: "codex", id: "latest" }],
      resolveTargetCwd: async () => "/tmp/fallback-cwd",
      launchSession: async (session) => {
        launched = session;
        return 0;
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(launched.cwd, "/tmp/fallback-cwd");
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

test("main routes --last --new with new launch mode", async () => {
  let launchOptions;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await main(["--last", "--new"], { stdout: { write: () => {} }, stderr: { write: () => {} } }, {
      getSessionsForCwd: async () => [
        {
          agent: "cursor",
          id: "latest",
          cwd: "/tmp/project",
          resumeCommand: ["cursor-agent", "--resume=latest"],
        },
      ],
      launchSession: async (_session, _io, options) => {
        launchOptions = options;
        return 0;
      },
    });
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.equal(launchOptions?.mode, "new");
});

test("main rejects --new without --last", async () => {
  const errors = [];
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await main(["--new"], { stdout: { write: () => {} }, stderr: { write: (value) => errors.push(value) } });
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.match(errors.join(""), /requires `--last`/);
});

test("help documents --no-preview", async () => {
  const chunks = [];
  await main(["--help"], {
    stdout: { write: (value) => chunks.push(value) },
    stderr: { write: () => {} },
  });
  assert.match(chunks.join(""), /--no-preview/);
});

test("main rejects unknown options instead of treating them as paths", async () => {
  const errors = [];
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await main(["--updgrade"], {
      stdout: { write: () => {} },
      stderr: { write: (value) => errors.push(value) },
    });
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.match(errors.join(""), /Unknown option: --updgrade/);
});
