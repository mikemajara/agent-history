import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserState, getVisibleSessions, handleBrowserInput, countPendingInScope } from "../src/tui/state.js";

const sessions = [
  {
    agent: "codex",
    id: "abc123",
    cwd: "/Users/miguel/github/alpha",
    preview: "build the parser",
  },
  {
    agent: "cursor",
    id: "def456",
    cwd: "/Users/miguel/github/beta",
    preview: "fix terminal search",
  },
];

test("slash enters live search mode", () => {
  const state = createBrowserState(sessions);

  assert.equal(handleBrowserInput(state, "/", { name: undefined }), "render");
  assert.equal(state.mode, "search");
});

test("j and k navigate in normal mode", () => {
  const state = createBrowserState(sessions);

  assert.equal(handleBrowserInput(state, "j", { name: "j" }), "render");
  assert.equal(state.selectedIndex, 1);
  assert.equal(handleBrowserInput(state, "k", { name: "k" }), "render");
  assert.equal(state.selectedIndex, 0);
});

test("j and k navigate when readline only provides key.name", () => {
  const state = createBrowserState(sessions);

  assert.equal(handleBrowserInput(state, undefined, { name: "j" }), "render");
  assert.equal(state.selectedIndex, 1);
  assert.equal(handleBrowserInput(state, undefined, { name: "k" }), "render");
  assert.equal(state.selectedIndex, 0);
});

test("j and k type into the query after slash opens search", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});

  assert.equal(handleBrowserInput(state, "j", { name: "j" }), "render");
  assert.equal(handleBrowserInput(state, "k", { name: "k" }), "render");
  assert.equal(state.mode, "search");
  assert.equal(state.search, "jk");
  assert.equal(state.selectedIndex, 0);
});

test("arrow keys move the list even when readline only provides the CSI sequence", () => {
  const state = createBrowserState(sessions);

  assert.equal(handleBrowserInput(state, "\x1b[B", {}), "render");
  assert.equal(state.selectedIndex, 1);
  assert.equal(handleBrowserInput(state, "\x1b[A", {}), "render");
  assert.equal(state.selectedIndex, 0);
  assert.equal(handleBrowserInput(state, undefined, { name: "down" }), "render");
  assert.equal(state.selectedIndex, 1);
  assert.equal(handleBrowserInput(state, undefined, { name: "up" }), "render");
  assert.equal(state.selectedIndex, 0);
});

test("left and right arrows change filter/sort rather than the selected row", () => {
  const state = createBrowserState(sessions, { initialScope: "all" });
  assert.equal(handleBrowserInput(state, undefined, { name: "right" }), "render");
  assert.equal(state.scope, "cwd");
  assert.equal(state.selectedIndex, 0);
});

test("preview pane starts on and ctrl+p toggles it without losing selection", () => {
  const state = createBrowserState(sessions);
  state.scope = "all";
  state.sort = "created";
  state.search = "terminal";
  state.selectedIndex = 1;
  state.selectedId = "def456";

  assert.equal(state.previewPane, true);
  assert.equal(handleBrowserInput(state, undefined, { name: "p", ctrl: true }), "render");
  assert.equal(state.previewPane, false);
  assert.equal(state.scope, "all");
  assert.equal(state.sort, "created");
  assert.equal(state.search, "terminal");
  assert.equal(state.selectedId, "def456");
  assert.equal(handleBrowserInput(state, undefined, { name: "p", ctrl: true }), "render");
  assert.equal(state.previewPane, true);
  assert.equal(state.selectedId, "def456");
});

test("noPreview option starts the browser with prompt text suppressed", () => {
  const state = createBrowserState(sessions, { noPreview: true });
  assert.equal(state.noPreview, true);
  assert.equal(createBrowserState(sessions).noPreview, false);
});

test("search mode treats q as text instead of quit", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});

  assert.equal(handleBrowserInput(state, "q", { name: "q" }), "render");
  assert.equal(state.search, "q");
  assert.equal(state.mode, "search");
});

test("search filters live and backspace edits query", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});
  handleBrowserInput(state, "b", {});
  handleBrowserInput(state, "e", {});

  assert.equal(getVisibleSessions(state).length, 1);
  assert.equal(getVisibleSessions(state)[0].id, "def456");

  handleBrowserInput(state, undefined, { name: "backspace" });
  assert.equal(state.search, "b");
});

test("ctrl+n selects a new session in the highlighted directory", () => {
  const state = createBrowserState(sessions);

  assert.equal(handleBrowserInput(state, undefined, { name: "n", ctrl: true }), "select-new");
  assert.equal(state.selectedId, "abc123");
});

test("ctrl+n from search mode selects a new session", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});
  for (const character of "terminal") {
    handleBrowserInput(state, character, {});
  }

  assert.equal(handleBrowserInput(state, undefined, { name: "n", ctrl: true }), "select-new");
  assert.equal(state.selectedId, "def456");
});

test("enter selects the highlighted session from search mode", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});
  for (const character of "terminal") {
    handleBrowserInput(state, character, {});
  }

  assert.equal(handleBrowserInput(state, "\r", { name: "return" }), "select");
  assert.equal(state.selectedId, "def456");
  assert.equal(state.search, "terminal");
});

test("escape clears query and exits search mode", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});
  handleBrowserInput(state, "b", {});

  assert.equal(handleBrowserInput(state, undefined, { name: "escape" }), "render");
  assert.equal(state.mode, "normal");
  assert.equal(state.search, "");
});

test("current directory is the default scope and controls operate over all sessions", () => {
  const datedSessions = [
    { agent: "codex", id: "old", cwd: "/tmp/project", startedAt: new Date("2026-01-05"), updatedAt: new Date("2026-01-03") },
    { agent: "cursor", id: "new", cwd: "/tmp/other", startedAt: new Date("2026-01-04"), updatedAt: new Date("2026-01-05") },
  ];
  const state = createBrowserState(datedSessions, { currentCwd: "/tmp/project" });

  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["old"]);
  assert.equal(handleBrowserInput(state, undefined, { name: "right" }), "render");
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["new", "old"]);

  assert.equal(handleBrowserInput(state, undefined, { name: "tab" }), "render");
  assert.equal(state.focusedControl, "sort");
  assert.equal(handleBrowserInput(state, undefined, { name: "right" }), "render");
  assert.equal(state.sort, "created");
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["old", "new"]);
});

test("printable input does not search until slash", () => {
  const state = createBrowserState([
    { agent: "codex", id: "first", preview: "alpha" },
    { agent: "codex", id: "second", preview: "bravo" },
  ]);

  assert.equal(handleBrowserInput(state, "b", {}), "ignore");
  assert.equal(state.mode, "normal");
  assert.equal(state.search, "");
  assert.equal(getVisibleSessions(state)[0]?.id, "first");
});

test("slash then typing searches; backspace edits the query", () => {
  const state = createBrowserState([
    { agent: "codex", id: "first", preview: "alpha" },
    { agent: "codex", id: "second", preview: "bravo" },
  ]);

  assert.equal(handleBrowserInput(state, "/", {}), "render");
  handleBrowserInput(state, "b", {});
  handleBrowserInput(state, "r", {});
  assert.equal(state.mode, "search");
  assert.equal(state.search, "br");
  assert.equal(getVisibleSessions(state)[0]?.id, "second");

  assert.equal(handleBrowserInput(state, undefined, { name: "backspace" }), "render");
  assert.equal(state.search, "b");
  assert.equal(getVisibleSessions(state)[0]?.id, "second");

  assert.equal(handleBrowserInput(state, "\x7f", {}), "render");
  assert.equal(state.search, "");
});

test("cwd scope still applies with dir: token", () => {
  const state = createBrowserState([
    { agent: "codex", id: "in-cwd", cwd: "/tmp/project", preview: "alpha" },
    { agent: "cursor", id: "other", cwd: "/tmp/other-project", preview: "alpha" },
  ], { currentCwd: "/tmp/project" });

  state.search = "dir:project";
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["in-cwd"]);
});

test("cwd scope still applies with date:today", () => {
  const now = new Date("2026-08-12T15:00:00");
  const state = createBrowserState([
    {
      agent: "codex",
      id: "today-cwd",
      cwd: "/tmp/project",
      updatedAt: new Date("2026-08-12T08:00:00"),
    },
    {
      agent: "cursor",
      id: "today-other",
      cwd: "/tmp/other",
      updatedAt: new Date("2026-08-12T09:00:00"),
    },
    {
      agent: "codex",
      id: "old-cwd",
      cwd: "/tmp/project",
      updatedAt: new Date("2026-08-10T08:00:00"),
    },
  ], { currentCwd: "/tmp/project", now });

  state.search = "date:today";
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["today-cwd"]);
});

test("free text works with tokens and ignores invalid date tokens", () => {
  const now = new Date("2026-08-12T15:00:00");
  const state = createBrowserState([
    {
      agent: "codex",
      id: "match",
      cwd: "/tmp/alpha",
      preview: "build the parser",
      updatedAt: new Date("2026-08-12T08:00:00"),
    },
    {
      agent: "cursor",
      id: "wrong-dir",
      cwd: "/tmp/beta",
      preview: "build the parser",
      updatedAt: new Date("2026-08-12T08:00:00"),
    },
    {
      agent: "codex",
      id: "wrong-text",
      cwd: "/tmp/alpha",
      preview: "unrelated work",
      updatedAt: new Date("2026-08-12T08:00:00"),
    },
  ], { now, initialScope: "all" });

  state.search = "dir:alpha date:bogus parser";
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["match"]);
});

test("free-text queries match agent names without agent: syntax", () => {
  const state = createBrowserState([
    { agent: "codex", id: "a", preview: "one" },
    { agent: "cursor", id: "b", preview: "two" },
  ], { initialScope: "all" });

  state.search = "cursor";
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["b"]);
});

test("token-only queries filter without requiring free text", () => {
  const state = createBrowserState([
    { agent: "codex", id: "a", cwd: "/tmp/alpha" },
    { agent: "cursor", id: "b", cwd: "/tmp/beta" },
  ], { initialScope: "all" });

  state.search = "dir:beta";
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["b"]);
});

test("ctrl+b pins and ctrl+t cycles status without stealing search letters", () => {
  const state = createBrowserState([
    { agent: "codex", id: "one", preview: "alpha", updatedAt: new Date("2026-01-02") },
    { agent: "cursor", id: "two", preview: "bravo", updatedAt: new Date("2026-01-03") },
  ], { initialScope: "all" });

  assert.equal(handleBrowserInput(state, "p", {}), "ignore");
  assert.equal(state.search, "");
  assert.equal(handleBrowserInput(state, undefined, { name: "b", ctrl: true }), "annotate");
  const selected = getVisibleSessions(state)[state.selectedIndex];
  assert.equal(selected.pinned, true);
  assert.equal(handleBrowserInput(state, undefined, { name: "t", ctrl: true }), "annotate");
  assert.equal(selected.status, "pending");
  assert.equal(handleBrowserInput(state, undefined, { name: "t", ctrl: true }), "annotate");
  assert.equal(selected.status, "parked");
  assert.equal(handleBrowserInput(state, undefined, { name: "t", ctrl: true }), "annotate");
  assert.equal(selected.status, undefined);
});

test("ctrl+t cycles a custom status list", () => {
  const state = createBrowserState(sessions, { statuses: ["todo", "waiting"] });
  const selected = getVisibleSessions(state)[state.selectedIndex];
  assert.equal(handleBrowserInput(state, undefined, { name: "t", ctrl: true }), "annotate");
  assert.equal(selected.status, "todo");
  assert.equal(handleBrowserInput(state, undefined, { name: "t", ctrl: true }), "annotate");
  assert.equal(selected.status, "waiting");
  assert.equal(handleBrowserInput(state, undefined, { name: "t", ctrl: true }), "annotate");
  assert.equal(selected.status, undefined);
});

test("ctrl+p still toggles preview instead of pinning", () => {
  const state = createBrowserState(sessions);
  assert.equal(handleBrowserInput(state, undefined, { name: "p", ctrl: true }), "render");
  assert.equal(state.previewPane, false);
  assert.equal(state.sessions[0].pinned, undefined);
});

test("search mode treats p and s as query text and still allows ctrl pin/status", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});
  assert.equal(handleBrowserInput(state, "p", {}), "render");
  assert.equal(handleBrowserInput(state, "s", {}), "render");
  assert.equal(state.search, "ps");

  handleBrowserInput(state, undefined, { name: "backspace" });
  handleBrowserInput(state, undefined, { name: "backspace" });
  handleBrowserInput(state, "p", {});
  assert.equal(state.search, "p");
  assert.equal(handleBrowserInput(state, undefined, { name: "b", ctrl: true }), "annotate");
  assert.equal(getVisibleSessions(state)[state.selectedIndex].pinned, true);
});

test("pinned then unpinned pending float above recency; parked does not", () => {
  const state = createBrowserState([
    { agent: "codex", id: "newest", updatedAt: new Date("2026-03-01"), preview: "new" },
    { agent: "cursor", id: "parked", updatedAt: new Date("2026-02-01"), status: "parked", preview: "park" },
    { agent: "claude", id: "pending", updatedAt: new Date("2026-01-01"), status: "pending", preview: "pend" },
    { agent: "fx", id: "pinned", updatedAt: new Date("2026-01-15"), pinned: true, preview: "pin" },
  ], { initialScope: "all" });

  assert.deepEqual(
    getVisibleSessions(state).map((session) => session.id),
    ["pinned", "pending", "newest", "parked"],
  );
});

test("pending footer count uses Cwd/All scope, not the search filter", () => {
  const state = createBrowserState([
    { agent: "codex", id: "in-cwd", cwd: "/tmp/project", status: "pending", preview: "alpha" },
    { agent: "cursor", id: "other", cwd: "/tmp/other", status: "pending", preview: "alpha" },
    { agent: "claude", id: "hidden", cwd: "/tmp/project", status: "pending", preview: "zzz" },
  ], { currentCwd: "/tmp/project" });

  state.search = "alpha";
  assert.equal(getVisibleSessions(state).length, 1);
  assert.equal(countPendingInScope(state), 2);

  state.scope = "all";
  assert.equal(countPendingInScope(state), 3);
});

