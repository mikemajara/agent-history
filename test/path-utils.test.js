import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  encodeClaudeProjectSlug,
  encodeCursorProjectSlug,
  resolveEncodedProjectSlug,
} from "../src/lib/path-utils.js";

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

test("resolves encoded slugs by walking existing path segments", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-slug-"));
  const project = path.join(root, "Users", "miguel", "github", "agent-history");
  await fs.mkdir(project, { recursive: true });

  const resolved = await resolveEncodedProjectSlug("Users-miguel-github-agent-history", { root });
  assert.equal(resolved, await fs.realpath(project));
});

test("resolves cursor slugs that strip leading dots from segments", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-dot-"));
  const project = path.join(root, "home", "miguel", ".dotfiles");
  await fs.mkdir(project, { recursive: true });

  const resolved = await resolveEncodedProjectSlug("home-miguel-dotfiles", {
    root,
    stripLeadingDots: true,
  });
  assert.equal(resolved, await fs.realpath(project));
});

test("does not invent paths when a slug cannot be resolved", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-missing-"));
  const resolved = await resolveEncodedProjectSlug("Users-miguel-missing-project", { root });
  assert.equal(resolved, undefined);
});
