import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationExcerpt,
  countUserTurns,
  highlightMatches,
  listColumnLayout,
  PREVIEW_SIDE_MIN_WIDTH,
  promptSnippet,
  renderBrowserFrame,
  renderSearchField,
  SEARCH_PLACEHOLDER,
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
  assert.match(lines[2], new RegExp(`┌ / .*${SEARCH_PLACEHOLDER.split(" · ")[0]}`));
  assert.match(lines[3], /Filter: Cwd \[All\]   Sort: \[Updated\] Created/);
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
  assert.match(lines[2], /┌ \//);
  assert.match(lines[2], /Search titles/);
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

test("buildConversationExcerpt anchors to the earliest free-text match with prior context", () => {
  const turns = [
    { role: "user", text: "First question about the layout." },
    { role: "assistant", text: "First answer about the layout." },
    { role: "user", text: "Second question about turn counts." },
    { role: "assistant", text: "Second answer about turn counts." },
    { role: "user", text: "Third question about the preview pane budget." },
  ];

  const matched = buildConversationExcerpt(turns, session, ["preview"]);
  assert.equal(matched[0].text, "Second answer about turn counts.");
  assert.equal(matched[1].text, "Third question about the preview pane budget.");

  const noMatch = buildConversationExcerpt(turns, session, ["zzzz"]);
  assert.equal(noMatch[0].text, "First question about the layout.");

  const empty = buildConversationExcerpt(turns, session, []);
  assert.equal(empty[0].text, "First question about the layout.");
});

test("search match highlights terms in the preview and ignores filter tokens", () => {
  const longTurns = [
    { role: "user", text: "First question about the layout." },
    { role: "assistant", text: "First answer about the layout." },
    { role: "user", text: "Please inspect the billing invoice totals." },
    { role: "assistant", text: "I will inspect the billing invoice totals." },
  ];
  const state = withSearchIndex(createBrowserState([session]), longTurns);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.search = "dir:github date:bogus billing";
  state.rankedSessions = [session];

  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const raw = renderBrowserFrame(state, 100, 30);
    const frame = plain(raw);
    assert.match(frame, /you: Please inspect the billing invoice totals/);
    assert.equal(frame.includes("First question about the layout"), false);
    assert.match(raw, /\x1b\[1;33mbilling\x1b\[0m/i);
    assert.equal(raw.toLowerCase().includes("\x1b[1;33mdir\x1b[0m"), false);
    assert.equal(raw.toLowerCase().includes("\x1b[1;33mgithub\x1b[0m"), false);
    assert.equal(raw.toLowerCase().includes("\x1b[1;33mbogus\x1b[0m"), false);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("empty query keeps the default conversation excerpt without highlights", () => {
  const state = withSearchIndex(createBrowserState([session]));
  state.now = new Date("2026-07-15T12:00:00Z");
  state.search = "";

  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const raw = renderBrowserFrame(state, 100, 30);
    assert.match(plain(raw), /you: A richer prompt with context/);
    assert.equal(raw.includes("\x1b[1;33m"), false);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("highlightMatches is a no-op under NO_COLOR", () => {
  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    assert.equal(highlightMatches("billing invoice", ["billing"]), "billing invoice");
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("no-match free text falls back to the default excerpt", () => {
  const state = withSearchIndex(createBrowserState([session]), [
    { role: "user", text: "First question about the layout." },
    { role: "assistant", text: "First answer about the layout." },
    { role: "user", text: "Later turn without the needle." },
  ]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.search = "zzzz";
  // Keep the selected session visible even though conversation text has no match.
  state.rankedSessions = [session];

  const frame = plain(renderBrowserFrame(state, 100, 30));
  assert.match(frame, /you: First question about the layout/);
});

test("search field shows teaching placeholder when empty", () => {
  const field = plain(renderSearchField({ search: "" }, 80));
  assert.match(field, /^┌ \/ /);
  assert.match(field, /Search titles, messages, paths/);
  assert.match(field, / ┐$/);
  assert.ok(field.includes(SEARCH_PLACEHOLDER.slice(0, 20)));
  assert.equal(field.length, 80);
});

test("search field shows short queries with an end cursor cell", () => {
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const raw = renderSearchField({ search: "parser" }, 80);
    const field = plain(raw);
    assert.match(field, /^┌ \/ parser/);
    assert.match(raw, /parser\x1b\[7m \x1b\[0m/);
    assert.match(field, / ┐$/);
    assert.equal(field.length, 80);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("search field left-truncates long overflowing queries", () => {
  const query = "x".repeat(120);
  const field = plain(renderSearchField({ search: query }, 60));
  assert.match(field, /^┌ \/ \.\.\./);
  assert.ok(field.includes("xxx"));
  assert.match(field, / ┐$/);
  assert.equal(field.length, 60);
  assert.equal(field.includes(query), false);
});
