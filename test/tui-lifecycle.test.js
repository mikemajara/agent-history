import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { launchSession, runInteractiveBrowser } from "../src/tui.js";

test("session launcher runs the resume command in its original directory", async () => {
  const cwd = process.cwd();
  const errors = [];
  const exitCode = await launchSession({
    cwd,
    resumeCommand: [
      process.execPath,
      "-e",
      `process.exit(process.cwd() === ${JSON.stringify(cwd)} ? 0 : 2)`,
    ],
  }, { stderr: { write: (value) => errors.push(value) } });

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
});

test("new session launch requires a known agent and project directory", async () => {
  const errors = [];
  const missingCwd = await launchSession({
    agent: "claude",
    resumeCommand: ["claude", "--resume", "x"],
  }, { stderr: { write: (value) => errors.push(value) } }, { mode: "new" });

  assert.equal(missingCwd, 1);
  assert.match(errors.join(""), /without a project directory/);

  errors.length = 0;
  const unknownAgent = await launchSession({
    agent: "unknown",
    cwd: process.cwd(),
  }, { stderr: { write: (value) => errors.push(value) } }, { mode: "new" });

  assert.equal(unknownAgent, 1);
  assert.match(errors.join(""), /No new-session command/);
});

test("interactive browser removes resize and key listeners on Ctrl+C", async () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = (value) => {
    stdin.rawMode = value;
  };
  stdin.resume = () => {};
  stdin.pause = () => {};

  const output = [];
  const io = {
    stdin,
    stdout: {
      isTTY: true,
      columns: 100,
      rows: 30,
      write: (value) => output.push(value),
    },
    stderr: { write: () => {} },
  };
  const before = process.listenerCount("SIGWINCH");
  const result = runInteractiveBrowser([{ agent: "codex", id: "one", preview: "hello" }], io);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(process.listenerCount("SIGWINCH"), before + 1);
  stdin.emit("keypress", "", { ctrl: true, name: "c" });

  assert.equal(await result, 130);
  assert.equal(process.listenerCount("SIGWINCH"), before);
  assert.equal(stdin.rawMode, false);
  assert.match(output.at(-1), /\x1b\[\?25h/);
});

test("Enter in search mode launches the selected session", async () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.resume = () => {};
  stdin.pause = () => {};

  const output = [];
  const io = {
    stdin,
    stdout: {
      isTTY: true,
      columns: 100,
      rows: 30,
      write: (value) => output.push(value),
    },
    stderr: { write: () => {} },
  };
  let launchedSession;
  let launchOptions;
  const result = runInteractiveBrowser([
    {
      agent: "codex",
      id: "session-one",
      cwd: "/tmp/global project",
      preview: "matching chat",
      resumeCommand: ["codex", "resume", "session-one"],
    },
  ], io, {
    launchSession: async (session, _io, options) => {
      launchedSession = session;
      launchOptions = options;
      return 0;
    },
  });

  stdin.emit("keypress", "/", {});
  stdin.emit("keypress", "m", {});
  stdin.emit("keypress", "\r", { name: "return" });

  assert.equal(await result, 0);
  assert.equal(launchedSession.id, "session-one");
  assert.equal(launchedSession.cwd, "/tmp/global project");
  assert.deepEqual(launchedSession.resumeCommand, ["codex", "resume", "session-one"]);
  assert.equal(launchOptions?.mode, "resume");
});

test("Ctrl+n launches a new session for the selected agent and directory", async () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.resume = () => {};
  stdin.pause = () => {};

  const io = {
    stdin,
    stdout: {
      isTTY: true,
      columns: 100,
      rows: 30,
      write: () => {},
    },
    stderr: { write: () => {} },
  };
  let launchedSession;
  let launchOptions;
  const result = runInteractiveBrowser([
    {
      agent: "claude",
      id: "session-one",
      cwd: "/tmp/project",
      preview: "hello",
      resumeCommand: ["claude", "--resume", "session-one"],
    },
  ], io, {
    launchSession: async (session, _io, options) => {
      launchedSession = session;
      launchOptions = options;
      return 0;
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  stdin.emit("keypress", "", { name: "n", ctrl: true });

  assert.equal(await result, 0);
  assert.equal(launchedSession.id, "session-one");
  assert.equal(launchOptions?.mode, "new");
});
