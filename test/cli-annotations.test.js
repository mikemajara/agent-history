import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli.js";
import { readAnnotations } from "../src/lib/annotations.js";

function io() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
    stdoutText: () => stdout.join(""),
    stderrText: () => stderr.join(""),
  };
}

const sessions = [
  { agent: "cursor", id: "aaa111", preview: "first", cwd: "/tmp/a" },
  { agent: "claude", id: "aaa111", preview: "other agent same id", cwd: "/tmp/b" },
  { agent: "codex", id: "bbb222", preview: "second", cwd: "/tmp/c" },
];

async function run(argv, dataDir) {
  const stream = io();
  process.exitCode = 0;
  await main(argv, stream, {
    dataDir,
    configPath: path.join(dataDir, "config.json"),
    getAllSessions: async () => sessions.map((session) => ({ ...session })),
  });
  return stream;
}

test("pin and status commands write the overlay without requiring a TUI", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cli-ann-"));

  const pinned = await run(["pin", "aaa111"], dataDir);
  assert.match(pinned.stdoutText(), /pinned: yes/);
  assert.equal(process.exitCode, 0);

  const setStatus = await run(["status", "aaa111", "pending"], dataDir);
  assert.match(setStatus.stdoutText(), /status: pending/);

  const overlay = await readAnnotations({ dataDir });
  assert.equal(overlay["cursor:aaa111"].pinned, true);
  assert.equal(overlay["cursor:aaa111"].status, "pending");
  assert.equal(overlay["claude:aaa111"], undefined);
});

test("status --clear removes status and leaves the pin", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cli-ann-"));
  await run(["pin", "bbb222"], dataDir);
  await run(["status", "bbb222", "parked"], dataDir);
  const cleared = await run(["status", "bbb222", "--clear"], dataDir);
  assert.match(cleared.stdoutText(), /status: -/);
  assert.match(cleared.stdoutText(), /pinned: yes/);
});

test("unknown id does not write the overlay", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cli-ann-"));
  const stream = await run(["pin", "missing"], dataDir);
  assert.match(stream.stderrText(), /Session not found: missing/);
  assert.equal(process.exitCode, 1);
  assert.deepEqual(await readAnnotations({ dataDir }), {});
});

test("ls always includes pin and status columns", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cli-ann-"));
  const stream = await run(["ls"], dataDir);
  assert.match(stream.stdoutText(), /pin/);
  assert.match(stream.stdoutText(), /status/);
});

test("show includes pin and status", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cli-ann-"));
  const stream = await run(["show", "bbb222"], dataDir);
  assert.match(stream.stdoutText(), /pinned: no/);
  assert.match(stream.stdoutText(), /status: -/);
});

test("cache clear does not delete the annotation overlay", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cache-ann-"));
  const dataDir = path.join(root, "data");
  const cacheDir = path.join(root, "cache");
  await run(["pin", "aaa111"], dataDir);
  process.exitCode = 0;
  const stream = io();
  await main(["cache", "clear"], stream, {
    cacheDir,
    dataDir,
    getAllSessions: async () => sessions.map((session) => ({ ...session })),
  });
  const overlay = await readAnnotations({ dataDir });
  assert.equal(overlay["cursor:aaa111"].pinned, true);
});

test("status command accepts values from the config status list", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cli-status-"));
  await fs.writeFile(path.join(dataDir, "config.json"), `${JSON.stringify({ statuses: ["todo", "waiting"] })}\n`);
  const stream = io();
  process.exitCode = 0;
  await main(["status", "aaa111", "todo"], stream, {
    dataDir,
    configPath: path.join(dataDir, "config.json"),
    getAllSessions: async () => sessions.map((session) => ({ ...session })),
  });
  assert.match(stream.stdoutText(), /status: todo/);
  const overlay = await readAnnotations({ dataDir, statuses: ["todo", "waiting"] });
  assert.equal(overlay["cursor:aaa111"].status, "todo");
});

test("interactive browser receives statuses from config", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cli-tui-status-"));
  await fs.writeFile(path.join(dataDir, "config.json"), `${JSON.stringify({ statuses: ["wip", "review", "done", "closed"] })}\n`);
  let browserOptions;
  await main([], io(), {
    dataDir,
    configPath: path.join(dataDir, "config.json"),
    getAllSessions: async () => sessions.map((session) => ({ ...session })),
    runInteractiveBrowser: async (_sessions, _io, options) => {
      browserOptions = options;
      return 0;
    },
  });
  assert.deepEqual(browserOptions.statuses, ["wip", "review", "done", "closed"]);
});
