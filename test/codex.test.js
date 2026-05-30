import test from "node:test";
import assert from "node:assert/strict";

test("codex preview logic skips wrapper metadata and keeps user prompt", async () => {
  const targetCwd = "/tmp/project";
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-codex-"));
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
  process.env.HOME = tempRoot;

  const { discoverCodexSessions } = await import("../src/providers/codex.js");
  const sessions = await discoverCodexSessions(targetCwd);
  assert.equal(sessions[0]?.preview, "actual user prompt");
});
