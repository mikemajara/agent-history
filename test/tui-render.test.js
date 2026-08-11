import test from "node:test";
import assert from "node:assert/strict";
import { renderBrowserFrame } from "../src/tui.js";
import { createBrowserState } from "../src/tui/state.js";

const session = {
  agent: "claude",
  id: "11111111-2222-4333-8444-555555555555",
  startedAt: new Date("2026-07-10T10:00:00Z"),
  updatedAt: new Date("2026-07-13T12:00:00Z"),
  cwd: "/Users/miguel/github/a-project-with-a-long-name",
  preview: "short prompt preview",
  resumeCommand: ["claude", "--resume", "11111111-2222-4333-8444-555555555555"],
  metadata: {
    model: "claude-opus-4",
    branch: "feature/session-details",
  },
};

/** Compact row columns: marker · age · agent · directory · preview */
const COLUMNS = {
  100: { age: 2, agent: 12, directory: 20, directoryWidth: 32, preview: 53 },
  60: { age: 2, agent: 12, directory: 20, directoryWidth: 16, preview: 37 },
};

function plain(output) {
  return output.replace(/\x1b\[[0-9;]*m/g, "");
}

function findSessionRow(lines, agent = undefined) {
  return lines.find((line) => {
    if (!/[›⌄] \S/.test(line)) return false;
    if (agent) return line.includes(agent);
    return /\b(claude|cursor|codex|opencode)\b/.test(line);
  });
}

test("100x30 frame follows the header, row, details, and footer contract", () => {
  const state = createBrowserState([session]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.expanded = true;
  state.searchIndex = {
    docs: [{
      turns: [
        { role: "user", text: "A richer prompt with context that is available from the transcript index." },
        { role: "assistant", text: "I will inspect the session details." },
      ],
    }],
  };

  const lines = plain(renderBrowserFrame(state, 100, 30)).split("\n");
  const row = findSessionRow(lines);
  const cols = COLUMNS[100];

  assert.equal(lines[0].trim(), "Resume a previous session");
  assert.match(lines[2], /Type to search.*Filter: Cwd \[All\]   Sort: \[Updated\] Created/);
  assert.ok(row, "expected a compact session row");
  assert.equal(row.slice(cols.age, cols.age + 9).trimEnd(), "2d ago");
  assert.equal(row.slice(cols.agent, cols.agent + 7).trimEnd(), "claude");
  assert.equal(
    row.slice(cols.directory, cols.directory + cols.directoryWidth).trimEnd(),
    "...ub/a-project-with-a-long-name",
  );
  assert.equal(row.slice(cols.preview).trimEnd(), "short prompt preview");
  assert.match(lines.join("\n"), /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(lines.join("\n"), /Model:\s+claude-opus-4/);
  assert.match(lines.join("\n"), /Branch:\s+feature\/session-details/);
  assert.match(lines.join("\n"), /you: A richer prompt with context/);
  assert.match(lines.at(-2), /enter resume   ctrl\+n new   esc exit   ctrl\+c exit   tab focus filter\/sort/);
  assert.match(lines.at(-1), /ctrl\+e expand   ↑\/↓ browse.*1 \/ 1 · 100%/);
  assert.ok(lines.every((line) => line.length <= 100));
});

test("60x16 frame keeps controls and rows within the terminal", () => {
  const state = createBrowserState([session]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.expanded = true;

  const lines = plain(renderBrowserFrame(state, 60, 16)).split("\n");
  const row = findSessionRow(lines);
  const cols = COLUMNS[60];

  assert.equal(lines[0].trim(), "Resume a previous session");
  assert.match(lines[2], /Type to search/);
  assert.match(lines[3], /Filter: Cwd \[All\]   Sort: \[Updated\] Created/);
  assert.ok(row, "expected a compact session row");
  assert.equal(row.slice(cols.age, cols.age + 9).trimEnd(), "2d ago");
  assert.equal(row.slice(cols.agent, cols.agent + 7).trimEnd(), "claude");
  assert.equal(row.slice(cols.directory, cols.directory + cols.directoryWidth), "...h-a-long-name");
  assert.equal(row.slice(cols.preview).trimEnd(), "short prompt preview");
  assert.match(lines.at(-2), /enter resume   ctrl\+n new   esc exit   tab focus/);
  assert.match(lines.at(-1), /ctrl\+e expand   ↑\/↓ browse/);
  assert.ok(lines.every((line) => line.length <= 60));
});

test("compact rows show encoded project slugs when cwd is missing", () => {
  const slugSession = {
    agent: "cursor",
    id: "slug-only",
    updatedAt: new Date("2026-07-14T12:00:00Z"),
    preview: "cursor prompt",
    metadata: { projectSlug: "Users-miguel-github-foo" },
  };
  const state = createBrowserState([slugSession]);
  state.now = new Date("2026-07-15T12:00:00Z");

  const row = findSessionRow(plain(renderBrowserFrame(state, 100, 30)).split("\n"), "cursor");
  const cols = COLUMNS[100];

  assert.ok(row);
  assert.equal(row.slice(cols.agent, cols.agent + 7).trimEnd(), "cursor");
  assert.equal(
    row.slice(cols.directory, cols.directory + cols.directoryWidth).trimEnd(),
    "Users-miguel-github-foo",
  );
  assert.equal(row.slice(cols.preview).trimEnd(), "cursor prompt");
});

test("compact rows keep a stable directory placeholder when project is unknown", () => {
  const bare = {
    agent: "codex",
    id: "bare",
    updatedAt: new Date("2026-07-14T12:00:00Z"),
    preview: "no project",
  };
  const state = createBrowserState([bare]);
  state.now = new Date("2026-07-15T12:00:00Z");

  const row = findSessionRow(plain(renderBrowserFrame(state, 100, 30)).split("\n"), "codex");
  const cols = COLUMNS[100];

  assert.ok(row);
  assert.equal(row.slice(cols.directory, cols.directory + cols.directoryWidth), "-".padEnd(cols.directoryWidth, " "));
  assert.equal(row.slice(cols.preview).trimEnd(), "no project");
  assert.equal(row.slice(cols.preview, cols.preview + 1), "n");
});

test("compact rows left-truncate long directories so the leaf stays visible", () => {
  const deep = {
    ...session,
    cwd: "/Users/miguel/github/org/very-long-team-name/services/billing-api",
    preview: "deep path",
  };
  const state = createBrowserState([deep]);
  state.now = new Date("2026-07-15T12:00:00Z");

  const row = findSessionRow(plain(renderBrowserFrame(state, 60, 16)).split("\n"));
  const cols = COLUMNS[60];
  const directory = row.slice(cols.directory, cols.directory + cols.directoryWidth);

  assert.ok(directory.startsWith("..."));
  assert.match(directory, /billing-api\s*$/);
});
