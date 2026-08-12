import test from "node:test";
import assert from "node:assert/strict";
import { getLaunchCommand, newSessionCommandForAgent } from "../src/lib/launch-command.js";

test("new session commands map each supported agent", () => {
  assert.deepEqual(newSessionCommandForAgent("claude"), ["claude"]);
  assert.deepEqual(newSessionCommandForAgent("cursor"), ["cursor-agent"]);
  assert.deepEqual(newSessionCommandForAgent("codex"), ["codex"]);
  assert.deepEqual(newSessionCommandForAgent("opencode"), ["opencode"]);
  assert.deepEqual(newSessionCommandForAgent("fx"), ["fx"]);
  assert.equal(newSessionCommandForAgent("unknown"), undefined);
});

test("getLaunchCommand switches between resume and new", () => {
  const session = {
    agent: "claude",
    resumeCommand: ["claude", "--resume", "abc"],
  };

  assert.deepEqual(getLaunchCommand(session), ["claude", "--resume", "abc"]);
  assert.deepEqual(getLaunchCommand(session, "resume"), ["claude", "--resume", "abc"]);
  assert.deepEqual(getLaunchCommand(session, "new"), ["claude"]);
});
