import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { formatProject, formatSessionTable } from "../src/format.js";

test("formats a session table with headers", () => {
  const output = formatSessionTable([
    {
      agent: "codex",
      id: "1234567890abcdef",
      updatedAt: new Date("2026-05-29T12:00:00Z"),
      preview: "hello world",
    },
  ]);

  assert.match(output, /agent/);
  assert.match(output, /codex/);
  assert.match(output, /1234567890ab/);
  assert.match(output, /hello world/);
});

test("formats home paths compactly", () => {
  assert.equal(formatProject({ cwd: path.join(os.homedir(), "github", "repo") }), "~/github/repo");
});
