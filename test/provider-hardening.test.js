import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Acceptance criteria for #5:
 * - Malformed JSONL records do not crash session discovery.
 * - Missing timestamps fall back to file metadata where appropriate.
 * - Tests cover representative malformed samples.
 */

async function withTempHome(prefix, fn) {
  const previousHome = process.env.HOME;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.HOME = tempRoot;
  try {
    return await fn(tempRoot);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
}

async function writeUnreadableJsonl(filePath) {
  await fs.writeFile(filePath, "{not-readable-later");
  await fs.chmod(filePath, 0);
}

test("readJsonl skips malformed lines and keeps valid records", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-jsonl-"));
  const filePath = path.join(tempRoot, "mixed.jsonl");
  await fs.writeFile(
    filePath,
    [
      "{not-json",
      JSON.stringify({ type: "ok", id: 1 }),
      "",
      "null",
      JSON.stringify({ type: "ok", id: 2 }),
      "{",
    ].join("\n"),
  );

  const { readJsonl } = await import("../src/lib/jsonl.js");
  const records = await readJsonl(filePath);
  assert.deepEqual(
    records.filter((record) => record && typeof record === "object" && record.type === "ok"),
    [
      { type: "ok", id: 1 },
      { type: "ok", id: 2 },
    ],
  );
});

test("cursor discovery survives malformed lines and uses file timestamps when missing", async () => {
  await withTempHome("agent-history-cursor-hard-", async (tempRoot) => {
    const targetCwd = "/tmp/cursor-hard";
    const slug = "tmp-cursor-hard";
    const transcriptRoot = path.join(tempRoot, ".cursor", "projects", slug, "agent-transcripts");
    await fs.mkdir(transcriptRoot, { recursive: true });

    const goodId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const goodPath = path.join(transcriptRoot, `${goodId}.jsonl`);
    await fs.writeFile(
      goodPath,
      [
        "THIS IS NOT JSON",
        JSON.stringify({
          type: "session_meta",
          payload: { id: goodId, cwd: targetCwd },
        }),
        "{broken",
        JSON.stringify({
          payload: { role: "user", content: [{ type: "text", text: "survives bad lines" }] },
        }),
      ].join("\n"),
    );

    const badPath = path.join(transcriptRoot, "unreadable.jsonl");
    await writeUnreadableJsonl(badPath);

    const { discoverCursorSessions } = await import(`../src/providers/cursor.js?hard=${Date.now()}`);
    const sessions = await discoverCursorSessions(targetCwd);
    const session = sessions.find((candidate) => candidate.id === goodId);

    assert.ok(session, "expected valid cursor session despite malformed lines");
    assert.equal(session.preview, "survives bad lines");
    assert.ok(session.startedAt instanceof Date);
    assert.ok(session.updatedAt instanceof Date);
    assert.ok(Number.isFinite(session.startedAt.getTime()));
    assert.ok(Number.isFinite(session.updatedAt.getTime()));

    await fs.chmod(badPath, 0o644);
  });
});

test("claude discovery survives malformed lines and uses file timestamps when missing", async () => {
  await withTempHome("agent-history-claude-hard-", async (tempRoot) => {
    const targetCwd = "/tmp/claude-hard";
    const slug = "-tmp-claude-hard";
    const projectRoot = path.join(tempRoot, ".claude", "projects", slug);
    await fs.mkdir(projectRoot, { recursive: true });

    const goodId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await fs.writeFile(
      path.join(projectRoot, `${goodId}.jsonl`),
      [
        "not-json-at-all",
        JSON.stringify({ sessionId: goodId, type: "summary" }),
        "{",
        JSON.stringify({
          sessionId: goodId,
          type: "user",
          cwd: targetCwd,
          message: { content: "claude survives too" },
        }),
      ].join("\n"),
    );

    await fs.mkdir(path.join(projectRoot, "directory-disguised-as.jsonl"), { recursive: true });

    const { discoverClaudeSessions } = await import(`../src/providers/claude.js?hard=${Date.now()}`);
    const sessions = await discoverClaudeSessions(targetCwd);
    const session = sessions.find((candidate) => candidate.id === goodId);

    assert.ok(session, "expected valid claude session despite malformed lines");
    assert.equal(session.preview, "claude survives too");
    assert.ok(session.startedAt instanceof Date);
    assert.ok(session.updatedAt instanceof Date);
  });
});

test("codex discovery survives malformed lines and uses file timestamps when missing", async () => {
  await withTempHome("agent-history-codex-hard-", async (tempRoot) => {
    const targetCwd = "/tmp/codex-hard";
    const sessionsRoot = path.join(tempRoot, ".codex", "sessions", "2026", "08", "12");
    await fs.mkdir(sessionsRoot, { recursive: true });

    const goodId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await fs.writeFile(
      path.join(sessionsRoot, `rollout-${goodId}.jsonl`),
      [
        "%%% broken line %%%",
        JSON.stringify({
          type: "session_meta",
          payload: { id: goodId, cwd: targetCwd },
        }),
        "{incomplete",
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "codex survives too" }],
          },
        }),
      ].join("\n"),
    );

    await fs.mkdir(path.join(sessionsRoot, "broken-dir.jsonl"), { recursive: true });
    const unreadablePath = path.join(sessionsRoot, "unreadable.jsonl");
    await writeUnreadableJsonl(unreadablePath);

    const { discoverCodexSessions } = await import(`../src/providers/codex.js?hard=${Date.now()}`);
    const sessions = await discoverCodexSessions(targetCwd);
    const session = sessions.find((candidate) => candidate.id === goodId);

    assert.ok(session, "expected valid codex session despite malformed lines");
    assert.equal(session.preview, "codex survives too");
    assert.ok(session.startedAt instanceof Date, "missing timestamps should fall back to file metadata");
    assert.ok(session.updatedAt instanceof Date, "missing timestamps should fall back to file metadata");

    await fs.chmod(unreadablePath, 0o644);
  });
});
