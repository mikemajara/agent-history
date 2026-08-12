import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverFxSessions, extractFxTurns } from "../src/providers/fx.js";

async function writeFxFixture(root, { id, cwd, includeIndex = true }) {
  const sessionsRoot = path.join(root, "sessions", id);
  await fs.mkdir(sessionsRoot, { recursive: true });

  await fs.writeFile(
    path.join(sessionsRoot, "session.json"),
    `${JSON.stringify({
      id,
      created_at_ms: 1760000000000,
      updated_at_ms: 1760000010000,
      workspace_root: cwd,
      history_len: 1,
      preferences: { model: "moonshotai/kimi-k3", effort: "medium" },
      total_input_tokens: 100,
      total_output_tokens: 50,
    })}\n`,
  );

  await fs.writeFile(
    path.join(sessionsRoot, "display.json"),
    `${JSON.stringify({
      title: "Build the fx provider",
      preview: "Build the fx provider",
    })}\n`,
  );

  await fs.writeFile(
    path.join(sessionsRoot, "events.jsonl"),
    [
      JSON.stringify({ kind: "session_started", timestamp_ms: 1760000000000, payload: { id } }),
      JSON.stringify({
        kind: "history_turn_committed",
        timestamp_ms: 1760000001000,
        payload: {
          turn: {
            kind: "assistant",
            user: { text: "Build the fx provider", images: [] },
            assistant: "I will add it.",
          },
        },
      }),
    ].join("\n") + "\n",
  );

  if (includeIndex) {
    const indexPath = path.join(root, "sessions", "index.json");
    await fs.writeFile(
      indexPath,
      `${JSON.stringify({
        schema_version: 3,
        sessions: [{
          id,
          created_at_ms: 1760000000000,
          updated_at_ms: 1760000010000,
          workspace_root: cwd,
          title: "Build the fx provider",
          preview: "Build the fx provider",
          history_len: 1,
          conversation_language: "en",
        }],
      })}\n`,
    );
  }
}

test("fx sessions use index metadata, event-log previews, and resume commands", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-fx-"));
  const id = "ses_test";
  const cwd = "/tmp/fx-project";
  await writeFxFixture(root, { id, cwd });

  const sessions = await discoverFxSessions(cwd, root);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.agent, "fx");
  assert.equal(sessions[0]?.preview, "Build the fx provider");
  assert.deepEqual(sessions[0]?.resumeCommand, ["fx", "--resume", id]);
  assert.equal(sessions[0]?.metadata?.model, "moonshotai/kimi-k3");
  assert.deepEqual(await extractFxTurns(sessions[0]), [
    { role: "user", text: "Build the fx provider" },
    { role: "assistant", text: "I will add it." },
  ]);
});

test("fx cwd filter excludes other workspaces", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-fx-filter-"));
  await writeFxFixture(root, { id: "ses_a", cwd: "/tmp/fx-a" });
  await writeFxFixture(root, { id: "ses_b", cwd: "/tmp/fx-b", includeIndex: false });

  const indexPath = path.join(root, "sessions", "index.json");
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  index.sessions.push({
    id: "ses_b",
    created_at_ms: 1760000000000,
    updated_at_ms: 1760000010000,
    workspace_root: "/tmp/fx-b",
    title: "Other",
    preview: "Other",
    history_len: 1,
  });
  await fs.writeFile(indexPath, `${JSON.stringify(index)}\n`);

  const sessions = await discoverFxSessions("/tmp/fx-a", root);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.id, "ses_a");
});

test("fx discovers session directories missing from index", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-fx-lag-"));
  await writeFxFixture(root, { id: "ses_indexed", cwd: "/tmp/fx-project", includeIndex: true });
  await writeFxFixture(root, { id: "ses_unindexed", cwd: "/tmp/fx-project", includeIndex: false });

  const sessions = await discoverFxSessions("/tmp/fx-project", root);
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((session) => session.id).sort(), ["ses_indexed", "ses_unindexed"]);
});

test("fx empty sessions have no preview or turns", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-fx-empty-"));
  const id = "ses_empty";
  const cwd = "/tmp/fx-empty";
  const sessionsRoot = path.join(root, "sessions", id);
  await fs.mkdir(sessionsRoot, { recursive: true });
  await fs.writeFile(
    path.join(sessionsRoot, "session.json"),
    `${JSON.stringify({
      id,
      created_at_ms: 1760000000000,
      updated_at_ms: 1760000000000,
      workspace_root: cwd,
      history_len: 0,
      preferences: { model: "moonshotai/kimi-k3" },
    })}\n`,
  );
  await fs.writeFile(
    path.join(root, "sessions", "index.json"),
    `${JSON.stringify({
      schema_version: 3,
      sessions: [{
        id,
        created_at_ms: 1760000000000,
        updated_at_ms: 1760000000000,
        workspace_root: cwd,
        title: "Untitled session",
        preview: null,
        history_len: 0,
      }],
    })}\n`,
  );

  const sessions = await discoverFxSessions(cwd, root);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.preview, undefined);
  assert.deepEqual(await extractFxTurns(sessions[0]), []);
});
