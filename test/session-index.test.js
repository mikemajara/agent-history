import test from "node:test";
import assert from "node:assert/strict";
import { matchesSessionCwd } from "../src/session-index.js";
import { encodeCursorProjectSlug } from "../src/lib/path-utils.js";

const targetCwd = "/Users/miguel/github/project-with-a-hyphen";

test("matches sessions with a canonical cwd", () => {
  const session = { agent: "codex", cwd: targetCwd };

  assert.equal(matchesSessionCwd(session, targetCwd), true);
  assert.equal(matchesSessionCwd(session, "/Users/miguel/github/other"), false);
});

test("matches Cursor all-project sessions by encoded slug", () => {
  const session = {
    agent: "cursor",
    metadata: { projectSlug: encodeCursorProjectSlug(targetCwd) },
  };

  assert.equal(matchesSessionCwd(session, targetCwd), true);
  assert.equal(matchesSessionCwd(session, "/Users/miguel/github/other"), false);
});

test("does not infer a path for sessions without cwd or project slug", () => {
  assert.equal(matchesSessionCwd({ agent: "cursor" }, targetCwd), false);
});
