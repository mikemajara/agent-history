import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  annotationKey,
  annotationRank,
  applyAnnotations,
  getAnnotationsPath,
  getStatuses,
  nextStatus,
  readAnnotations,
  upsertAnnotation,
} from "../src/lib/annotations.js";

test("annotation keys include agent so ids do not collide", () => {
  assert.equal(annotationKey({ agent: "cursor", id: "abc" }), "cursor:abc");
  assert.equal(annotationKey({ agent: "claude", id: "abc" }), "claude:abc");
});

test("status cycles none → pending → parked → none", () => {
  assert.equal(nextStatus(undefined), "pending");
  assert.equal(nextStatus("pending"), "parked");
  assert.equal(nextStatus("parked"), undefined);
  assert.equal(nextStatus("blocked"), "pending");
});

test("nextStatus cycles a custom string list", () => {
  const statuses = ["todo", "waiting"];
  assert.equal(nextStatus(undefined, statuses), "todo");
  assert.equal(nextStatus("todo", statuses), "waiting");
  assert.equal(nextStatus("waiting", statuses), undefined);
});

test("getStatuses reads a JSON string array from config", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-cfg-"));
  const configPath = path.join(dir, "config.json");
  await fs.writeFile(configPath, `${JSON.stringify({ statuses: ["todo", "waiting"] })}\n`);
  assert.deepEqual(getStatuses({ configPath }), ["todo", "waiting"]);

  await fs.writeFile(configPath, `${JSON.stringify(["alpha", "beta"])}\n`);
  assert.deepEqual(getStatuses({ configPath }), ["alpha", "beta"]);

  await fs.writeFile(configPath, `${JSON.stringify({ statuses: [{ id: "nope" }] })}\n`);
  assert.deepEqual(getStatuses({ configPath }), ["pending", "parked"]);
});

test("annotation rank is pin, then unpinned pending, then the rest", () => {
  assert.equal(annotationRank({ pinned: true, status: "parked" }), 0);
  assert.equal(annotationRank({ pinned: false, status: "pending" }), 1);
  assert.equal(annotationRank({ status: "parked" }), 2);
  assert.equal(annotationRank({}), 2);
});

test("annotation rank floats the first status in the list", () => {
  const statuses = ["waiting", "parked"];
  assert.equal(annotationRank({ status: "waiting" }, statuses), 1);
  assert.equal(annotationRank({ status: "parked" }, statuses), 2);
});

test("applyAnnotations ignores orphans and invalid statuses", () => {
  const sessions = [
    { agent: "cursor", id: "one", preview: "a" },
    { agent: "claude", id: "one", preview: "b" },
  ];
  const merged = applyAnnotations(sessions, {
    "cursor:one": { pinned: true, status: "pending" },
    "claude:one": { status: "blocked" },
    "codex:missing": { pinned: true, status: "pending" },
  });

  assert.equal(merged[0].pinned, true);
  assert.equal(merged[0].status, "pending");
  assert.equal(merged[1].pinned, false);
  assert.equal(merged[1].status, undefined);
});

test("upsert persists pin/status and survives as a separate overlay file", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-ann-"));
  const session = { agent: "cursor", id: "abc" };

  await upsertAnnotation(session, { pinned: true, status: "pending" }, { dataDir });
  const filePath = getAnnotationsPath({ dataDir });
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(raw.annotations["cursor:abc"].pinned, true);
  assert.equal(raw.annotations["cursor:abc"].status, "pending");

  await upsertAnnotation(session, { status: null }, { dataDir });
  const afterClear = await readAnnotations({ dataDir });
  assert.equal(afterClear["cursor:abc"].pinned, true);
  assert.equal(afterClear["cursor:abc"].status, undefined);

  await upsertAnnotation(session, { pinned: false }, { dataDir });
  assert.deepEqual(await readAnnotations({ dataDir }), {});
});
