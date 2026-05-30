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
