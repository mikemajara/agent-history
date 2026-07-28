import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildIndex, search } from "../src/lib/search.js";

test("search indexes normalized metadata and Cursor payload turns", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-search-"));
  const transcriptPath = path.join(root, "session.jsonl");
  await fs.writeFile(transcriptPath, [
    JSON.stringify({ role: "user", payload: { role: "user", content: "payload user request" } }),
    JSON.stringify({ role: "assistant", payload: { role: "assistant", content: "payload answer" } }),
  ].join("\n"));

  const sessions = [{
    agent: "cursor",
    id: "cursor-123",
    cwd: "/tmp/search-project",
    preview: "short preview",
    transcriptPath,
    metadata: { branch: "feature-branch" },
  }];
  const index = await buildIndex(sessions);

  assert.equal(search(index, "feature-branch", sessions)[0]?.session.id, "cursor-123");
  assert.equal(search(index, "payload answer", sessions)[0]?.snippet.role, "assistant");
});
