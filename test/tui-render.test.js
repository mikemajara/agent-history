import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationExcerpt,
  countUserTurns,
  formatAgentBadge,
  formatFlag,
  highlightMatches,
  listColumnLayout,
  PREVIEW_SIDE_MIN_WIDTH,
  promptSnippet,
  renderBrowserFrame,
  renderSearchField,
  SEARCH_PLACEHOLDER,
} from "../src/tui/render.js";
import { NERD_BOOKMARK, STAR_PIN, pinMarker, resetNerdFontCache } from "../src/lib/icons.js";
import { createBrowserState, handleBrowserInput } from "../src/tui/state.js";

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
  assert.match(header, /AGE\s+AGENT\s+META\s+DIRECTORY\s+PROMPT\s+TURNS/);
  assert.ok(row, "expected a compact session row");
  assert.equal(row.slice(cols.age, cols.age + layout.age).trimEnd(), "2d ago");
  assert.equal(row.slice(cols.agent, cols.agent + layout.agent).trimEnd(), "claude");
  assert.equal(
    row.slice(cols.directory, cols.directory + layout.directory).trimEnd(),
    "...ub/a-project-with-a-long-name",
  );
  assert.equal(
    row.slice(cols.prompt, cols.prompt + layout.prompt).trimEnd(),
    "short prompt preview with ex...",
  );
  assert.equal(row.slice(cols.turns, cols.turns + layout.turns).trim(), "2");
  assert.ok(!row.includes("│"), "stacked layout keeps the list row full-width");
  assert.match(frame, /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(frame, /Model:\s+claude-opus-4/);
  assert.match(frame, /Branch:\s+feature\/session-details/);
  assert.match(frame, /Turns:\s+2/);
  assert.match(frame, /Pinned:\s+no/);
  assert.match(frame, /Status:\s+-/);
  assert.match(frame, /you: A richer prompt with context/);
  assert.match(lines.at(-2), /\[enter\] resume.*\[ctrl\+n\] new.*\[esc\] exit.*\[ctrl\+c\] exit.*\[tab\] focus.*\[←\/→\] option/);
  assert.match(lines.at(-1), /\[ctrl\+b\] pin.*\[ctrl\+t\] status.*\[ctrl\+p\] preview.*\[↑\/↓\] browse.*1 \/ 1 · 100%/);
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

  const frame = plain(renderBrowserFrame(state, 100, 36));
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
  assert.match(header, /AGE\s+AGENT\s+META\s+PROMPT\s+TURNS/);
  assert.equal(header.includes("DIRECTORY"), false);
  assert.ok(row, "expected a compact session row");
  assert.equal(row.slice(cols.age, cols.age + layout.age).trimEnd(), "2d ago");
  assert.equal(row.slice(cols.agent, cols.agent + layout.agent).trimEnd(), "claude");
  assert.equal(
    row.slice(cols.prompt, cols.prompt + layout.prompt).trimEnd(),
    "short prompt preview ...",
  );
  assert.equal(row.slice(cols.turns, cols.turns + layout.turns).trim(), "-");
  assert.match(lines.join("\n"), /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(lines.at(-2), /\[enter\] resume.*\[ctrl\+n\] new.*\[esc\] exit.*\[tab\] focus/);
  assert.match(lines.at(-1), /\[ctrl\+p\] preview.*\[↑\/↓\] browse/);
  assert.ok(lines.every((line) => line.length <= 60));
});

test("footer keycaps emphasize Enter and fit wide/narrow terminals", () => {
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const state = withSearchIndex(createBrowserState([session]));
    state.now = new Date("2026-07-15T12:00:00Z");

    for (const width of [100, 60]) {
      const raw = renderBrowserFrame(state, width, 30);
      const lines = plain(raw).split("\n");
      assert.ok(lines.every((line) => line.length <= width), `footer must fit width ${width}`);
      assert.match(lines.at(-2), /\[enter\] resume/);
      assert.match(lines.at(-2), /\[ctrl\+n\] new/);
      assert.match(lines.at(-2), /\[esc\] exit/);
      assert.match(lines.at(-1), /\[ctrl\+p\]/);
      assert.match(lines.at(-1), /1 \/ 1 · 100%/);

      // Primary Enter uses accent; secondary keycaps stay muted/dim.
      assert.match(raw, /\x1b\[7m\[enter\]\x1b\[0m/);
      assert.match(raw, /\x1b\[2m\[esc\]\x1b\[0m/);
      assert.match(raw, /\x1b\[2m\[ctrl\+n\]\x1b\[0m/);
    }
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("footer keycaps stay plain under NO_COLOR", () => {
  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    const state = createBrowserState([session]);
    state.now = new Date("2026-07-15T12:00:00Z");
    const raw = renderBrowserFrame(state, 100, 30);
    assert.equal(raw.includes("\x1b["), false);
    const lines = raw.split("\n");
    assert.match(lines.at(-2), /\[enter\] resume.*\[ctrl\+n\] new.*\[esc\] exit/);
    assert.match(lines.at(-1), /\[ctrl\+p\].*\[↑\/↓\] browse/);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("help text still documents Enter resume and Ctrl+n", () => {
  const state = createBrowserState([session]);
  handleBrowserInput(state, "?", {});
  assert.match(state.message, /Enter resume/);
  assert.match(state.message, /Ctrl\+n new in directory/);
  assert.match(state.message, /Ctrl\+p toggle preview pane/);
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
  assert.match(lines.at(-1), /\[ctrl\+p\] preview/);
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
    "short prompt preview with ex...",
  );
  assert.equal(frame.includes("Session:"), false);
  assert.equal(frame.includes("Conversation:"), false);
  assert.match(lines.at(-1), /\[ctrl\+p\] preview/);
});

test("noPreview hides conversation text while keeping metadata in the pane", () => {
  const state = withSearchIndex(createBrowserState([session], { noPreview: true }));
  state.now = new Date("2026-07-15T12:00:00Z");

  const frame = plain(renderBrowserFrame(state, 100, 30));
  assert.match(frame, /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(frame, /Model:\s+claude-opus-4/);
  assert.equal(frame.includes("Conversation:"), false);
  assert.equal(frame.includes("you:"), false);
  assert.equal(frame.includes("short prompt preview"), false);
  assert.match(frame, /no-preview on/);

  const layout = listColumnLayout(100);
  const row = findSessionRow(frame.split("\n"), "claude");
  assert.ok(row);
  assert.equal(row.slice(layout.columns.prompt, layout.columns.prompt + layout.prompt).trimEnd(), "-");
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
    const raw = renderBrowserFrame(state, PREVIEW_SIDE_MIN_WIDTH, 30);
    const frame = plain(raw);
    assert.match(frame, /you: Please inspect the billing invoice/);
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
    const raw = renderSearchField({ search: "parser", mode: "search" }, 80);
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
  const field = plain(renderSearchField({ search: query, mode: "search" }, 60));
  assert.match(field, /^┌ \/ \.\.\./);
  assert.ok(field.includes("xxx"));
  assert.match(field, / ┐$/);
  assert.equal(field.length, 60);
  assert.equal(field.includes(query), false);
});

test("formatAgentBadge keeps stable width and colors known agents", () => {
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    assert.equal(plain(formatAgentBadge("claude")).length, 7);
    assert.equal(plain(formatAgentBadge("opencode")).trimEnd(), "open");
    assert.match(formatAgentBadge("cursor"), /^\x1b\[90m/);
    assert.match(formatAgentBadge("claude"), /^\x1b\[38;5;208m/);
    assert.match(formatAgentBadge("codex"), /^\x1b\[34m/);
    assert.match(formatAgentBadge("opencode"), /^\x1b\[35m/);
    assert.match(formatAgentBadge("fx"), /^\x1b\[30m/);
    assert.equal(formatAgentBadge("fx", { color: false }), "fx     ");
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("NO_COLOR keeps badge text without ANSI and columns stay aligned", () => {
  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    assert.equal(formatAgentBadge("cursor"), "cursor ");
    const agents = ["claude", "cursor", "codex", "opencode"];
    const sessions = agents.map((agent, index) => ({
      ...session,
      agent,
      id: `${agent}-${index}`,
      preview: `${agent} work item`,
    }));
    const state = createBrowserState(sessions);
    state.now = new Date("2026-07-15T12:00:00Z");
    state.previewPane = false;
    const layout = listColumnLayout(100);
    const lines = plain(renderBrowserFrame(state, 100, 30)).split("\n");
    const expected = { claude: "claude", cursor: "cursor", codex: "codex", opencode: "open" };

    for (const agent of agents) {
      const row = lines.find((line) => {
        const cell = line.slice(layout.columns.agent, layout.columns.agent + layout.agent).trimEnd();
        return cell === expected[agent];
      });
      assert.ok(row, `expected row for ${agent}`);
      assert.equal(
        row.slice(layout.columns.agent, layout.columns.agent + layout.agent).length,
        layout.agent,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("colored agent badges appear in rows and preview when color is enabled", () => {
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const state = withSearchIndex(createBrowserState([session]));
    state.now = new Date("2026-07-15T12:00:00Z");
    // Select a blank second session so the first row is not inverse-only.
    state.sessions = [
      session,
      { ...session, id: "other", agent: "cursor", preview: "other" },
    ];
    state.searchIndex = {
      docs: state.sessions.map(() => ({ turns: [] })),
    };
    state.selectedIndex = 1;
    state.selectedId = "other";

    const raw = renderBrowserFrame(state, 100, 30);
    assert.match(raw, /\x1b\[38;5;208mclaude \x1b\[0m/);
    assert.match(raw, /Provider:\s+\x1b\[90mcursor \x1b\[0m/);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("preview conversation renders basic markdown styles", () => {
  const state = withSearchIndex(createBrowserState([session]), [
    { role: "user", text: "# Setup\nUse **bold** and `code`.\n- first item" },
    { role: "assistant", text: "Done." },
  ]);
  state.now = new Date("2026-07-15T12:00:00Z");

  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const raw = renderBrowserFrame(state, PREVIEW_SIDE_MIN_WIDTH, 30);
    const frame = plain(raw);
    assert.match(frame, /you: Setup/);
    assert.match(frame, /Use bold and code/);
    assert.match(frame, /• first item/);
    assert.equal(frame.includes("**bold**"), false);
    assert.match(raw, /\x1b\[1mSetup\x1b\[0m/);
    assert.match(raw, /\x1b\[1mbold\x1b\[0m/);
    assert.match(raw, /\x1b\[36mcode\x1b\[0m/);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("formatFlag distinguishes pin, pending, and parked", () => {
  const previous = process.env.AGENT_HISTORY_NERD_FONTS;
  process.env.AGENT_HISTORY_NERD_FONTS = "0";
  resetNerdFontCache();
  try {
    assert.equal(formatFlag({}).trim(), "");
    assert.equal(formatFlag({ pinned: true }).trim(), STAR_PIN);
    assert.match(formatFlag({ status: "pending" }), /pending/);
    assert.match(formatFlag({ status: "parked" }), /parked/);
    assert.match(formatFlag({ pinned: true, status: "pending" }), new RegExp(`^${STAR_PIN} pending`));
    assert.notEqual(formatFlag({ status: "pending" }), formatFlag({ status: "parked" }));
  } finally {
    if (previous === undefined) delete process.env.AGENT_HISTORY_NERD_FONTS;
    else process.env.AGENT_HISTORY_NERD_FONTS = previous;
    resetNerdFontCache();
  }
});

test("pinMarker uses a Nerd Font bookmark when enabled and a star otherwise", () => {
  const previous = process.env.AGENT_HISTORY_NERD_FONTS;
  try {
    process.env.AGENT_HISTORY_NERD_FONTS = "0";
    resetNerdFontCache();
    assert.equal(pinMarker(), STAR_PIN);

    process.env.AGENT_HISTORY_NERD_FONTS = "1";
    resetNerdFontCache();
    assert.equal(pinMarker(), NERD_BOOKMARK);
  } finally {
    if (previous === undefined) delete process.env.AGENT_HISTORY_NERD_FONTS;
    else process.env.AGENT_HISTORY_NERD_FONTS = previous;
    resetNerdFontCache();
  }
});

test("pending count appears in the footer only for the current scope", () => {
  const pending = { ...session, id: "pend", status: "pending", cwd: "/tmp/project" };
  const other = { ...session, id: "other", status: "pending", cwd: "/tmp/other" };
  const state = createBrowserState([pending, other], { currentCwd: "/tmp/project" });
  state.now = new Date("2026-07-15T12:00:00Z");

  const cwdFrame = plain(renderBrowserFrame(state, 100, 24));
  assert.match(cwdFrame, /1 pending/);
  assert.match(cwdFrame, /Pinned:\s+no/);
  assert.match(cwdFrame, /Status:\s+pending/);

  state.scope = "all";
  const allFrame = plain(renderBrowserFrame(state, 100, 24));
  assert.match(allFrame, /2 pending/);
});
