import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-codex-"));
process.env.HOME = tempRoot;

const { discoverCodexSessions } = await import("../src/providers/codex.js");

test("codex preview logic skips wrapper metadata and keeps user prompt", async () => {
  const targetCwd = "/tmp/project";
  const sessionsRoot = path.join(tempRoot, ".codex", "sessions", "2026", "05", "29");
  await fs.mkdir(sessionsRoot, { recursive: true });

  const transcriptPath = path.join(sessionsRoot, "rollout.jsonl");
  const lines = [
    JSON.stringify({
      timestamp: "2026-05-29T10:00:00.000Z",
      type: "session_meta",
      payload: { id: "abc123", timestamp: "2026-05-29T10:00:00.000Z", cwd: targetCwd },
    }),
    JSON.stringify({
      timestamp: "2026-05-29T10:00:01.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>ignored</environment_context>" }] },
    }),
    JSON.stringify({
      timestamp: "2026-05-29T10:00:02.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "actual user prompt" }] },
    }),
  ].join("\n");

  await fs.writeFile(transcriptPath, lines);

  const sessions = await discoverCodexSessions(targetCwd);
  const session = sessions.find((s) => s.id === "abc123");
  assert.equal(session?.preview, "actual user prompt");
});

test("codex resume command uses codex resume <id>", async () => {
  const targetCwd = "/tmp/codex-project";
  const sessionsRoot = path.join(tempRoot, ".codex", "sessions", "2026", "06", "14");
  await fs.mkdir(sessionsRoot, { recursive: true });

  const sessionId = "67d8a4d1-f10c-4f6e-9ce9-0b1234567890";
  const transcriptPath = path.join(sessionsRoot, `rollout-${sessionId}.jsonl`);
  const lines = [
    JSON.stringify({
      timestamp: "2026-06-14T10:00:00.000Z",
      type: "session_meta",
      payload: { id: sessionId, timestamp: "2026-06-14T10:00:00.000Z", cwd: targetCwd },
    }),
  ].join("\n");

  await fs.writeFile(transcriptPath, lines);

  const sessions = await discoverCodexSessions(targetCwd);
  const session = sessions.find((s) => s.id === sessionId);
  assert.ok(session, "expected to find codex session by id");
  assert.deepEqual(session?.resumeCommand, ["codex", "resume", sessionId]);
  assert.equal(session?.resumeCommand?.join(" "), `codex resume ${sessionId}`);
});
