import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const PROVIDERS = [
  {
    name: "claude",
    cwd: "/tmp/agent-history-cross-claude",
    sessionId: "11111111-1111-4111-8111-111111111111",
    binary: "claude",
    joinedPattern: /^claude --resume [0-9a-f-]{36}$/,
    setup: async (home, cwd, sessionId) => {
      const projectRoot = path.join(home, ".claude", "projects", "-tmp-agent-history-cross-claude");
      await fs.mkdir(projectRoot, { recursive: true });
      const lines = [
        JSON.stringify({ sessionId, timestamp: "2026-06-14T10:00:00.000Z", type: "summary" }),
        JSON.stringify({
          sessionId,
          timestamp: "2026-06-14T10:00:01.000Z",
          type: "user",
          cwd,
          message: { content: "hi" },
        }),
      ].join("\n");
      await fs.writeFile(path.join(projectRoot, `${sessionId}.jsonl`), lines);
    },
    discover: async (cwd) => {
      const { discoverClaudeSessions } = await import("../src/providers/claude.js");
      return discoverClaudeSessions(cwd);
    },
  },
  {
    name: "cursor",
    cwd: "/tmp/agent-history-cross-cursor",
    sessionId: "22222222-2222-4222-8222-222222222222",
    binary: "cursor-agent",
    joinedPattern: /^cursor-agent --resume=[0-9a-f-]{36}$/,
    setup: async (home, cwd, sessionId) => {
      const transcriptRoot = path.join(
        home,
        ".cursor",
        "projects",
        "tmp-agent-history-cross-cursor",
        "agent-transcripts",
      );
      await fs.mkdir(transcriptRoot, { recursive: true });
      const lines = [
        JSON.stringify({
          type: "session_meta",
          timestamp: "2026-06-14T10:00:00.000Z",
          payload: { id: sessionId, timestamp: "2026-06-14T10:00:00.000Z", cwd },
        }),
      ].join("\n");
      await fs.writeFile(path.join(transcriptRoot, `${sessionId}.jsonl`), lines);
    },
    discover: async (cwd) => {
      const { discoverCursorSessions } = await import("../src/providers/cursor.js");
      return discoverCursorSessions(cwd);
    },
  },
  {
    name: "codex",
    cwd: "/tmp/agent-history-cross-codex",
    sessionId: "33333333-3333-4333-8333-333333333333",
    binary: "codex",
    joinedPattern: /^codex resume [0-9a-f-]{36}$/,
    setup: async (home, cwd, sessionId) => {
      const sessionsRoot = path.join(home, ".codex", "sessions", "2026", "06", "14");
      await fs.mkdir(sessionsRoot, { recursive: true });
      const lines = [
        JSON.stringify({
          timestamp: "2026-06-14T10:00:00.000Z",
          type: "session_meta",
          payload: { id: sessionId, timestamp: "2026-06-14T10:00:00.000Z", cwd },
        }),
      ].join("\n");
      await fs.writeFile(path.join(sessionsRoot, `rollout-${sessionId}.jsonl`), lines);
    },
    discover: async (cwd) => {
      const { discoverCodexSessions } = await import("../src/providers/codex.js");
      return discoverCodexSessions(cwd);
    },
  },
];

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cross-"));
process.env.HOME = tempRoot;

for (const provider of PROVIDERS) {
  await provider.setup(tempRoot, provider.cwd, provider.sessionId);
}

for (const provider of PROVIDERS) {
  test(`${provider.name}: resumeCommand is well-formed and includes session id`, async () => {
    const sessions = await provider.discover(provider.cwd);
    assert.equal(sessions.length, 1, `expected one ${provider.name} session`);

    const cmd = sessions[0]?.resumeCommand;
    assert.ok(Array.isArray(cmd), "resumeCommand must be an array");
    assert.ok(cmd.length >= 2, "resumeCommand must have at least binary + arg");
    for (const part of cmd) {
      assert.ok(typeof part === "string" && part.length > 0, `empty resumeCommand element in ${JSON.stringify(cmd)}`);
    }

    assert.equal(cmd[0], provider.binary, `wrong binary for ${provider.name}`);

    const joined = cmd.join(" ");
    assert.match(joined, UUID, `session id missing from "${joined}"`);
    assert.ok(joined.includes(provider.sessionId), `expected id ${provider.sessionId} in "${joined}"`);
    assert.match(joined, provider.joinedPattern, `"${joined}" does not match ${provider.joinedPattern}`);
  });
}
