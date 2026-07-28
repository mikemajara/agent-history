import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserState, getVisibleSessions, handleBrowserInput } from "../src/tui/state.js";

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

test("ctrl+e toggles the selected session details panel", () => {
  const state = createBrowserState(sessions);

  assert.equal(handleBrowserInput(state, undefined, { name: "e", ctrl: true }), "render");
  assert.equal(state.expanded, true);
  assert.equal(handleBrowserInput(state, undefined, { name: "e", ctrl: true }), "render");
  assert.equal(state.expanded, false);
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

test("enter leaves search mode and keeps query", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});
  handleBrowserInput(state, "b", {});

  assert.equal(handleBrowserInput(state, "\r", { name: "return" }), "render");
  assert.equal(state.mode, "normal");
  assert.equal(state.search, "b");
});

test("escape clears query and exits search mode", () => {
  const state = createBrowserState(sessions);
  handleBrowserInput(state, "/", {});
  handleBrowserInput(state, "b", {});

  assert.equal(handleBrowserInput(state, undefined, { name: "escape" }), "render");
  assert.equal(state.mode, "normal");
  assert.equal(state.search, "");
});

test("scope and sort controls operate over the preloaded session collection", () => {
  const datedSessions = [
    { agent: "codex", id: "old", cwd: "/tmp/project", startedAt: new Date("2026-01-05"), updatedAt: new Date("2026-01-03") },
    { agent: "cursor", id: "new", cwd: "/tmp/other", startedAt: new Date("2026-01-04"), updatedAt: new Date("2026-01-05") },
  ];
  const state = createBrowserState(datedSessions, { currentCwd: "/tmp/project", initialScope: "cwd" });

  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["old"]);
  assert.equal(handleBrowserInput(state, undefined, { name: "right" }), "render");
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["new", "old"]);

  assert.equal(handleBrowserInput(state, undefined, { name: "tab" }), "render");
  assert.equal(state.focusedControl, "sort");
  assert.equal(handleBrowserInput(state, undefined, { name: "right" }), "render");
  assert.equal(state.sort, "created");
  assert.deepEqual(getVisibleSessions(state).map((session) => session.id), ["old", "new"]);
});

test("printable input starts search without requiring slash", () => {
  const state = createBrowserState([
    { agent: "codex", id: "first", preview: "alpha" },
    { agent: "codex", id: "second", preview: "bravo" },
  ]);

  assert.equal(handleBrowserInput(state, "b", {}), "render");
  assert.equal(state.search, "b");
  assert.equal(getVisibleSessions(state)[0]?.id, "second");
});
