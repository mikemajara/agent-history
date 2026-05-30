import test from "node:test";
import assert from "node:assert/strict";
import { encodeClaudeProjectSlug, encodeCursorProjectSlug } from "../src/lib/path-utils.js";

test("encodes cursor slug from absolute path", () => {
  assert.equal(
    encodeCursorProjectSlug("/Users/miguel/github/agent-history"),
    "Users-miguel-github-agent-history",
  );
});

test("encodes claude slug with prefixed dash", () => {
  assert.equal(
    encodeClaudeProjectSlug("/Users/miguel/github/agent-history"),
    "-Users-miguel-github-agent-history",
  );
});
