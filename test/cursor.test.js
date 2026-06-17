import test from "node:test";
import assert from "node:assert/strict";

test("cursor resume command uses cursor-agent --resume=<id>", async () => {
  const targetCwd = "/tmp/project";
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cursor-"));
  const transcriptRoot = path.join(tempRoot, ".cursor", "projects", "tmp-project", "agent-transcripts");
  await fs.mkdir(transcriptRoot, { recursive: true });

  const sessionId = "9ee3a8bc-6a43-4933-abcd-8983f2986e28";
  const transcriptPath = path.join(transcriptRoot, `${sessionId}.jsonl`);
  const lines = [
    JSON.stringify({
      type: "session_meta",
      timestamp: "2026-06-13T10:00:00.000Z",
      payload: { id: sessionId, timestamp: "2026-06-13T10:00:00.000Z", cwd: targetCwd },
    }),
    JSON.stringify({
      timestamp: "2026-06-13T10:00:01.000Z",
      payload: { role: "user", content: [{ type: "text", text: "fix the resume command" }] },
    }),
  ].join("\n");

  await fs.writeFile(transcriptPath, lines);
  process.env.HOME = tempRoot;

  const { discoverCursorSessions } = await import("../src/providers/cursor.js");
  const sessions = await discoverCursorSessions(targetCwd);

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0]?.resumeCommand, ["cursor-agent", `--resume=${sessionId}`]);
  assert.equal(sessions[0]?.resumeCommand?.join(" "), `cursor-agent --resume=${sessionId}`);
});
