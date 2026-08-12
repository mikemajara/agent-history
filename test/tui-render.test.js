import test from "node:test";
import assert from "node:assert/strict";
import {
  countUserTurns,
  listColumnLayout,
  PREVIEW_SIDE_MIN_WIDTH,
  promptSnippet,
  renderBrowserFrame,
} from "../src/tui/render.js";
import { createBrowserState } from "../src/tui/state.js";

const session = {
  agent: "claude",
  id: "11111111-2222-4333-8444-555555555555",
  startedAt: new Date("2026-07-10T10:00:00Z"),
  updatedAt: new Date("2026-07-13T12:00:00Z"),
  cwd: "/Users/miguel/github/a-project-with-a-long-name",
  preview: "short prompt preview with extra words beyond the limit",
  resumeCommand: ["claude", "--resume", "11111111-2222-4333-8444-555555555555"],
  metadata: {
    model: "claude-opus-4",
    branch: "feature/session-details",
  },
};

function plain(output) {
  return output.replace(/\x1b\[[0-9;]*m/g, "");
}

function findSessionRow(lines, agent = undefined) {
  return lines.find((line) => {
    if (!/[›] \S/.test(line)) return false;
    if (agent) return line.includes(agent);
    return /\b(claude|cursor|codex|opencode)\b/.test(line);
  });
}

function findColumnHeader(lines) {
  return lines.find((line) => /\bAGE\b/.test(line) && /\bPROMPT\b/.test(line) && /\bTURNS\b/.test(line));
}

function withSearchIndex(state, turns = undefined) {
  state.searchIndex = {
    docs: state.sessions.map(() => ({
      turns: turns ?? [
        { role: "user", text: "A richer prompt with context that is available from the transcript index." },
        { role: "assistant", text: "I will inspect the session details." },
        { role: "user", text: "And another question." },
      ],
    })),
  };
  return state;
}

test("promptSnippet keeps the first six words", () => {
  assert.equal(
    promptSnippet("one two three four five six seven eight"),
    "one two three four five six",
  );
  assert.equal(promptSnippet(""), "-");
});

test("countUserTurns counts only user prompts once the index is ready", () => {
  const state = withSearchIndex(createBrowserState([session]));
  assert.equal(countUserTurns(state, session), 2);

  const pending = createBrowserState([session]);
  assert.equal(countUserTurns(pending, session), undefined);
});

test("100x30 frame stacks the preview pane and uses the indexed list columns", () => {
  const state = withSearchIndex(createBrowserState([session]));
  state.now = new Date("2026-07-15T12:00:00Z");
  const layout = listColumnLayout(100);

  const lines = plain(renderBrowserFrame(state, 100, 30)).split("\n");
  const header = findColumnHeader(lines);
  const row = findSessionRow(lines);
  const frame = lines.join("\n");
  const cols = layout.columns;

  assert.equal(state.previewPane, true);
  assert.equal(lines[0].trim(), "Resume a previous session");
  assert.match(lines[2], /Type to search.*Filter: Cwd \[All\]   Sort: \[Updated\] Created/);
  assert.ok(header, "expected column headers");
  assert.match(header, /AGE\s+AGENT\s+DIRECTORY\s+PROMPT\s+TURNS/);
  assert.ok(row, "expected a compact session row");
  assert.equal(row.slice(cols.age, cols.age + layout.age).trimEnd(), "2d ago");
  assert.equal(row.slice(cols.agent, cols.agent + layout.agent).trimEnd(), "claude");
  assert.equal(
    row.slice(cols.directory, cols.directory + layout.directory).trimEnd(),
    ".../github/a-project-with-a-long-name",
  );
  assert.equal(
    row.slice(cols.prompt, cols.prompt + layout.prompt).trimEnd(),
    "short prompt preview with extra w...",
  );
  assert.equal(row.slice(cols.turns, cols.turns + layout.turns).trim(), "2");
  assert.ok(!row.includes("│"), "stacked layout keeps the list row full-width");
  assert.match(frame, /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(frame, /Model:\s+claude-opus-4/);
  assert.match(frame, /Branch:\s+feature\/session-details/);
  assert.match(frame, /Turns:\s+2/);
  assert.match(frame, /you: A richer prompt with context/);
  assert.match(frame, /ai:\s+I will inspect the session details/);
  assert.match(frame, /you: And another question/);
  assert.match(lines.at(-2), /enter resume   ctrl\+n new   esc exit   ctrl\+c exit   tab focus filter\/sort/);
  assert.match(lines.at(-1), /ctrl\+p preview   ↑\/↓ browse.*1 \/ 1 · 100%/);
  assert.ok(lines.every((line) => line.length <= 100));
});

test("focused filter/sort control is inverse-highlighted", () => {
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const state = createBrowserState([session]);
    state.now = new Date("2026-07-15T12:00:00Z");
    state.focusedControl = "filter";

    const filterFocused = renderBrowserFrame(state, 100, 30);
    assert.match(
      filterFocused,
      /\x1b\[7mFilter: Cwd \[All\]\x1b\[0m {3}Sort: \[Updated\] Created/,
    );

    state.focusedControl = "sort";
    const sortFocused = renderBrowserFrame(state, 100, 30);
    assert.match(
      sortFocused,
      /Filter: Cwd \[All\] {3}\x1b\[7mSort: \[Updated\] Created\x1b\[0m/,
    );
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("preview pane fills remaining height with later conversation turns", () => {
  const longTurns = [
    { role: "user", text: "First question about the layout." },
    { role: "assistant", text: "First answer about the layout." },
    { role: "user", text: "Second question about turn counts." },
    { role: "assistant", text: "Second answer about turn counts." },
    { role: "user", text: "Third question about the preview pane budget." },
    { role: "assistant", text: "Third answer about the preview pane budget." },
  ];
  const state = withSearchIndex(createBrowserState([session]), longTurns);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.previewPane = true;

  const frame = plain(renderBrowserFrame(state, 100, 30));
  assert.match(frame, /Turns:\s+3/);
  assert.match(frame, /you: First question about the layout/);
  assert.match(frame, /you: Second question about turn counts/);
  assert.match(frame, /Third question|ai:  Second answer|\.\.\./);
});

test("60x16 frame drops directory and keeps headers within the terminal", () => {
  const state = createBrowserState([session]);
  state.now = new Date("2026-07-15T12:00:00Z");
  const layout = listColumnLayout(60);

  const lines = plain(renderBrowserFrame(state, 60, 16)).split("\n");
  const header = findColumnHeader(lines);
  const row = findSessionRow(lines);
  const cols = layout.columns;

  assert.equal(layout.showDirectory, false);
  assert.equal(lines[0].trim(), "Resume a previous session");
  assert.match(lines[2], /Type to search/);
  assert.match(lines[3], /Filter: Cwd \[All\]   Sort: \[Updated\] Created/);
  assert.ok(header);
  assert.match(header, /AGE\s+AGENT\s+PROMPT\s+TURNS/);
  assert.equal(header.includes("DIRECTORY"), false);
  assert.ok(row, "expected a compact session row");
  assert.equal(row.slice(cols.age, cols.age + layout.age).trimEnd(), "2d ago");
  assert.equal(row.slice(cols.agent, cols.agent + layout.agent).trimEnd(), "claude");
  assert.equal(
    row.slice(cols.prompt, cols.prompt + layout.prompt).trimEnd(),
    "short prompt preview with extra...",
  );
  assert.equal(row.slice(cols.turns, cols.turns + layout.turns).trim(), "-");
  assert.match(lines.join("\n"), /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(lines.at(-2), /enter resume   ctrl\+n new   esc exit   tab focus/);
  assert.match(lines.at(-1), /ctrl\+p preview   ↑\/↓ browse/);
  assert.ok(lines.every((line) => line.length <= 60));
});

test("wide terminals render a side preview pane beside the list", () => {
  const width = PREVIEW_SIDE_MIN_WIDTH;
  const state = withSearchIndex(createBrowserState([session]));
  state.now = new Date("2026-07-15T12:00:00Z");

  const lines = plain(renderBrowserFrame(state, width, 30)).split("\n");
  const row = findSessionRow(lines);
  const frame = lines.join("\n");
  const listWidth = Math.floor(width * 0.62);

  assert.ok(row, "expected a compact session row");
  assert.equal(row[listWidth], "│");
  assert.match(findColumnHeader(lines).slice(listWidth + 1), /Session:\s+11111111/);
  assert.match(frame, /Session:\s+11111111/);
  assert.match(frame, /Model:\s+claude-opus-4/);
  assert.match(frame, /you: A richer prompt with context/);
  assert.match(lines.at(-1), /ctrl\+p preview/);
  assert.ok(lines.every((line) => line.length <= width));
});

test("toggling the preview pane off restores a full-width list without details", () => {
  const state = withSearchIndex(createBrowserState([session]));
  state.now = new Date("2026-07-15T12:00:00Z");
  state.previewPane = false;
  const layout = listColumnLayout(100);

  const lines = plain(renderBrowserFrame(state, 100, 30)).split("\n");
  const row = findSessionRow(lines);
  const frame = lines.join("\n");

  assert.ok(row);
  assert.equal(
    row.slice(layout.columns.prompt, layout.columns.prompt + layout.prompt).trimEnd(),
    "short prompt preview with extra w...",
  );
  assert.equal(frame.includes("Session:"), false);
  assert.equal(frame.includes("Conversation:"), false);
  assert.match(lines.at(-1), /ctrl\+p preview/);
});

test("noPreview hides conversation text while keeping metadata in the pane", () => {
  const state = withSearchIndex(createBrowserState([session]));
  state.now = new Date("2026-07-15T12:00:00Z");
  state.noPreview = true;

  const frame = plain(renderBrowserFrame(state, 100, 30));
  assert.match(frame, /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(frame, /Model:\s+claude-opus-4/);
  assert.equal(frame.includes("Conversation:"), false);
  assert.equal(frame.includes("you:"), false);
});

test("compact rows show encoded project slugs when cwd is missing", () => {
  const slugSession = {
    agent: "cursor",
    id: "slug-only",
    updatedAt: new Date("2026-07-14T12:00:00Z"),
    preview: "cursor prompt about search",
    metadata: { projectSlug: "Users-miguel-github-foo" },
  };
  const state = createBrowserState([slugSession]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.previewPane = false;
  const layout = listColumnLayout(100);

  const row = findSessionRow(plain(renderBrowserFrame(state, 100, 30)).split("\n"), "cursor");
  const cols = layout.columns;

  assert.ok(row);
  assert.equal(row.slice(cols.agent, cols.agent + layout.agent).trimEnd(), "cursor");
  assert.equal(
    row.slice(cols.directory, cols.directory + layout.directory).trimEnd(),
    "Users-miguel-github-foo",
  );
  assert.equal(row.slice(cols.prompt, cols.prompt + layout.prompt).trimEnd(), "cursor prompt about search");
});

test("compact rows keep a stable directory placeholder when project is unknown", () => {
  const bare = {
    agent: "codex",
    id: "bare",
    updatedAt: new Date("2026-07-14T12:00:00Z"),
    preview: "no project yet here",
  };
  const state = createBrowserState([bare]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.previewPane = false;
  const layout = listColumnLayout(100);

  const row = findSessionRow(plain(renderBrowserFrame(state, 100, 30)).split("\n"), "codex");
  const cols = layout.columns;

  assert.ok(row);
  assert.equal(row.slice(cols.directory, cols.directory + layout.directory), "-".padEnd(layout.directory, " "));
  assert.equal(row.slice(cols.prompt, cols.prompt + layout.prompt).trimEnd(), "no project yet here");
});

test("compact rows left-truncate long directories so the leaf stays visible", () => {
  const deep = {
    ...session,
    cwd: "/Users/miguel/github/org/very-long-team-name/services/billing-api",
    preview: "deep path",
  };
  const state = createBrowserState([deep]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.previewPane = false;
  const layout = listColumnLayout(100);

  const row = findSessionRow(plain(renderBrowserFrame(state, 100, 30)).split("\n"));
  const directory = row.slice(layout.columns.directory, layout.columns.directory + layout.directory);

  assert.ok(directory.startsWith("..."));
  assert.match(directory, /billing-api\s*$/);
});
