import test from "node:test";
import assert from "node:assert/strict";

test("claude resume command uses claude --resume <id>", async () => {
  const targetCwd = "/tmp/project";
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-claude-"));
  const projectRoot = path.join(tempRoot, ".claude", "projects", "-tmp-project");
  await fs.mkdir(projectRoot, { recursive: true });

  const sessionId = "02c39201-83d4-4613-a1db-e8148bcf3b0d";
  const transcriptPath = path.join(projectRoot, `${sessionId}.jsonl`);
  const lines = [
    JSON.stringify({
      sessionId,
      timestamp: "2026-06-14T10:00:00.000Z",
      type: "summary",
    }),
    JSON.stringify({
      sessionId,
      timestamp: "2026-06-14T10:00:01.000Z",
      type: "user",
      cwd: targetCwd,
      message: { content: "fix the resume command" },
    }),
  ].join("\n");

  await fs.writeFile(transcriptPath, lines);
  process.env.HOME = tempRoot;

  const { discoverClaudeSessions } = await import("../src/providers/claude.js");
  const sessions = await discoverClaudeSessions(targetCwd);

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0]?.resumeCommand, ["claude", "--resume", sessionId]);
  assert.equal(sessions[0]?.resumeCommand?.join(" "), `claude --resume ${sessionId}`);
});
