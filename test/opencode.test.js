import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { discoverOpenCodeSessions, extractOpenCodeTurns } from "../src/providers/opencode.js";

test("OpenCode sessions use SQLite metadata, user text previews, and resume commands", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-opencode-"));
  const databasePath = path.join(root, "opencode.db");
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY, directory TEXT NOT NULL, title TEXT NOT NULL,
      agent TEXT, model TEXT, time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL, time_archived INTEGER
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    "ses_test", "/tmp/opencode-project", "A session title", "build",
    JSON.stringify({ id: "gpt-5", providerID: "openai" }), 1760000000000, 1760000010000, null,
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_user", "ses_test", 1760000000001, 1760000000001, JSON.stringify({ role: "user" }),
  );
  db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)").run(
    "part_user", "msg_user", "ses_test", 1760000000002, 1760000000002,
    JSON.stringify({ type: "text", text: "Build the OpenCode provider" }),
  );
  db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
    "msg_assistant", "ses_test", 1760000000003, 1760000000003, JSON.stringify({ role: "assistant" }),
  );
  db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)").run(
    "part_assistant", "msg_assistant", "ses_test", 1760000000004, 1760000000004,
    JSON.stringify({ type: "text", text: "I will add it." }),
  );
  db.close();

  const sessions = await discoverOpenCodeSessions("/tmp/opencode-project", databasePath);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.preview, "Build the OpenCode provider");
  assert.deepEqual(sessions[0]?.resumeCommand, ["opencode", "--session", "ses_test"]);
  assert.equal(sessions[0]?.metadata?.model, "gpt-5");
  assert.equal(sessions[0]?.metadata?.modelProvider, "openai");
  assert.deepEqual(await extractOpenCodeTurns(sessions[0]), [
    { role: "user", text: "Build the OpenCode provider" },
    { role: "assistant", text: "I will add it." },
  ]);
});
