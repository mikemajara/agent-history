import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { formatCompactDate, formatProject, formatSessionTable, shortenId } from "../src/format.js";

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
  assert.match(output, /abcdef/);
  assert.match(output, /2026-05-29 \d{2}:00/);
  assert.match(output, /hello world/);
});

test("formats home paths compactly", () => {
  assert.equal(formatProject({ cwd: path.join(os.homedir(), "github", "repo") }), "~/github/repo");
});

test("shortens ids from the end", () => {
  assert.equal(shortenId("1234567890abcdef"), "abcdef");
});

test("formats compact local date with minutes", () => {
  assert.match(formatCompactDate(new Date("2026-05-29T12:34:00Z")), /^2026-05-29 \d{2}:34$/);
});
