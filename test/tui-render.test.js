import test from "node:test";
import assert from "node:assert/strict";
import { renderBrowserFrame } from "../src/tui.js";
import { createBrowserState } from "../src/tui/state.js";

const session = {
  agent: "claude",
  id: "11111111-2222-4333-8444-555555555555",
  updatedAt: new Date("2026-07-13T12:00:00Z"),
  cwd: "/Users/miguel/github/a-project-with-a-long-name",
  preview: "short prompt preview",
  transcriptPath: "/Users/miguel/.claude/projects/a-project/11111111-2222-4333-8444-555555555555.jsonl",
  resumeCommand: ["claude", "--resume", "11111111-2222-4333-8444-555555555555"],
  metadata: {
    model: "claude-opus-4",
    branch: "feature/session-details",
    entrypoint: "cli",
    version: "1.2.3",
  },
};

test("details panel shows complete selected-session metadata and indexed context", () => {
  const state = createBrowserState([session]);
  state.expanded = true;
  state.searchIndex = {
    docs: [{ turns: [{ role: "user", text: "A richer prompt with context that is available from the transcript index." }] }],
  };

  const output = renderBrowserFrame(state, 100, 30);
  const compactOutput = output.replace(/\s+/g, " ");

  assert.match(output, /─ details ─/);
  assert.match(output, /provider: claude/);
  assert.match(output, /id: 11111111-2222-4333-8444-555555555555/);
  assert.match(output, /project: \/Users\/miguel\/github\/a-project-with-a-long-name/);
  assert.match(compactOutput, /transcript: \/Users\/miguel\/\.claude\/projects\/a-project\/11111111-2222-4333-8444-555555555555\.jsonl/);
  assert.match(output, /model: claude-opus-4/);
  assert.match(output, /branch: feature\/session-details/);
  assert.match(output, /entrypoint: cli/);
  assert.match(output, /version: 1\.2\.3/);
  assert.match(compactOutput, /resume: cd \/Users\/miguel\/github\/a-project-with-a-long-name && claude --resume/);
  assert.match(output, /A richer prompt with context that is available from the transcript index\./);
});

test("index rows stay single-line when the details panel is open", () => {
  const state = createBrowserState([session]);
  state.expanded = true;

  const width = 70;
  const output = renderBrowserFrame(state, width, 24);
  const lines = output.split("\n");
  const indexLines = lines.filter((line) => line.startsWith("> "));

  assert.equal(indexLines.length, 1);
  assert.ok(indexLines[0].length <= width);
  assert.ok(lines.every((line) => line.length <= width));
  assert.doesNotMatch(indexLines[0], /cwd:|transcript:|resume:/);
});
