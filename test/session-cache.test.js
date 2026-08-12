import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  clearSessionCache,
  collectSourceFingerprint,
  getCachePath,
  readSessionCache,
  reviveSessions,
  serializeSessions,
  writeSessionCache,
} from "../src/lib/session-cache.js";

test("serializeSessions and reviveSessions round-trip dates", () => {
  const startedAt = new Date("2026-08-01T10:00:00Z");
  const updatedAt = new Date("2026-08-02T11:00:00Z");
  const [revived] = reviveSessions(serializeSessions([
    {
      agent: "codex",
      id: "abc",
      startedAt,
      updatedAt,
      cwd: "/tmp/project",
      preview: "hello",
      resumeCommand: ["codex", "resume", "abc"],
      metadata: { branch: "main" },
    },
  ]));

  assert.equal(revived.startedAt?.toISOString(), startedAt.toISOString());
  assert.equal(revived.updatedAt?.toISOString(), updatedAt.toISOString());
  assert.equal(revived.agent, "codex");
  assert.deepEqual(revived.resumeCommand, ["codex", "resume", "abc"]);
});

test("session cache hits on matching fingerprint and misses when sources change", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cache-"));
  const cacheDir = path.join(root, "cache");
  const sources = path.join(root, "sources");
  await fs.mkdir(path.join(sources, "agent-transcripts"), { recursive: true });
  const transcript = path.join(sources, "agent-transcripts", "one.jsonl");
  await fs.writeFile(transcript, "{\"ok\":true}\n");

  const fingerprint = await collectSourceFingerprint({
    cursorRoot: sources,
    claudeProjectsRoot: path.join(root, "missing-claude"),
    claudeHistoryPath: path.join(root, "missing-history.jsonl"),
    codexSessionsRoot: path.join(root, "missing-codex"),
    opencodeDbPath: path.join(root, "missing-opencode.db"),
  });

  const cachePath = getCachePath({ cacheDir });
  const sessions = [{
    agent: "cursor",
    id: "one",
    cwd: "/tmp/project",
    preview: "cached",
    startedAt: new Date("2026-08-01T10:00:00Z"),
    updatedAt: new Date("2026-08-01T11:00:00Z"),
  }];

  await writeSessionCache(cachePath, sessions, fingerprint);
  const hit = await readSessionCache(cachePath, fingerprint);
  assert.equal(hit?.length, 1);
  assert.equal(hit[0].id, "one");
  assert.equal(hit[0].updatedAt?.toISOString(), "2026-08-01T11:00:00.000Z");

  await fs.writeFile(transcript, "{\"ok\":true,\"changed\":1}\n");
  const changed = await collectSourceFingerprint({
    cursorRoot: sources,
    claudeProjectsRoot: path.join(root, "missing-claude"),
    claudeHistoryPath: path.join(root, "missing-history.jsonl"),
    codexSessionsRoot: path.join(root, "missing-codex"),
    opencodeDbPath: path.join(root, "missing-opencode.db"),
  });
  assert.notEqual(changed.signature, fingerprint.signature);
  assert.equal(await readSessionCache(cachePath, changed), null);

  await clearSessionCache(cachePath);
  assert.equal(await readSessionCache(cachePath, fingerprint), null);
});
