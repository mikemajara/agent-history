import { formatProject } from "../format.js";
import { search } from "../lib/search.js";

export function createBrowserState(sessions) {
  return {
    sessions,
    selectedIndex: 0,
    expanded: false,
    mode: "normal",
    search: "",
    message: "",
    searchIndex: null,
    indexing: false,
    rankedSessions: null,
    snippetMap: new Map(),
  };
}

export function getVisibleSessions(state) {
  if (!state.search) {
    return state.sessions;
  }

  if (state.rankedSessions !== null) {
    return state.rankedSessions;
  }

  // Fallback substring filter while index is loading
  const query = state.search.toLowerCase();
  return state.sessions.filter((session) => getSearchFields(session).some((value) => value.includes(query)));
}

export function setSearchIndex(state, index) {
  state.searchIndex = index;
  state.indexing = false;
  updateSearchResults(state);
}

function updateSearchResults(state) {
  if (!state.search || !state.searchIndex) {
    state.rankedSessions = null;
    state.snippetMap = new Map();
    return;
  }

  const results = search(state.searchIndex, state.search, state.sessions);
  state.rankedSessions = results.map((r) => r.session);
  state.snippetMap = new Map(
    results.map((r) => [r.session.id, r.snippet]).filter(([, v]) => v),
  );
}

export function handleBrowserInput(state, str, key) {
  const visibleSessions = getVisibleSessions(state);

  if (key?.ctrl && key.name === "c") {
    return "exit-interrupted";
  }

  if (state.mode === "search") {
    return handleSearchInput(state, str, key, visibleSessions);
  }

  return handleNormalInput(state, str, key, visibleSessions);
}

function handleNormalInput(state, str, key, visibleSessions) {
  if (key?.name === "q") {
    return "exit";
  }

  if (key?.name === "down" || str === "j") {
    moveSelection(state, 1, visibleSessions);
    return "render";
  }

  if (key?.name === "up" || str === "k") {
    moveSelection(state, -1, visibleSessions);
    return "render";
  }

  if (key?.ctrl && key.name === "e") {
    state.expanded = !state.expanded;
    return "render";
  }

  if (key?.ctrl && key.name === "u") {
    state.search = "";
    state.selectedIndex = 0;
    state.message = "";
    state.rankedSessions = null;
    state.snippetMap = new Map();
    return "render";
  }

  if (str === "/") {
    state.mode = "search";
    state.message = "";
    return "render";
  }

  if (str === "?") {
    state.message =
      "Controls: j/k/arrows navigate, Enter print resume, / search, Esc clear+leave search, Ctrl+u clear, q quit | Search matches all conversation text";
    return "render";
  }

  if (key?.name === "return") {
    return "select";
  }

  return "ignore";
}

function handleSearchInput(state, str, key, visibleSessions) {
  if (key?.name === "escape") {
    state.search = "";
    state.selectedIndex = 0;
    state.mode = "normal";
    state.message = "";
    state.rankedSessions = null;
    state.snippetMap = new Map();
    return "render";
  }

  if (key?.name === "return") {
    state.mode = "normal";
    state.message = "";
    clampSelection(state, getVisibleSessions(state));
    return "render";
  }

  if (key?.name === "backspace" || key?.name === "delete") {
    state.search = state.search.slice(0, -1);
    state.selectedIndex = 0;
    updateSearchResults(state);
    return "render";
  }

  if (key?.ctrl && key.name === "u") {
    state.search = "";
    state.selectedIndex = 0;
    state.rankedSessions = null;
    state.snippetMap = new Map();
    return "render";
  }

  if (key?.name === "down") {
    moveSelection(state, 1, visibleSessions);
    return "render";
  }

  if (key?.name === "up") {
    moveSelection(state, -1, visibleSessions);
    return "render";
  }

  if (isPrintable(str, key)) {
    state.search += str;
    state.selectedIndex = 0;
    updateSearchResults(state);
    return "render";
  }

  return "ignore";
}

function moveSelection(state, delta, visibleSessions) {
  state.selectedIndex += delta;
  clampSelection(state, visibleSessions);
}

export function clampSelection(state, visibleSessions = getVisibleSessions(state)) {
  if (visibleSessions.length === 0) {
    state.selectedIndex = 0;
    return;
  }

  state.selectedIndex = Math.max(0, Math.min(state.selectedIndex, visibleSessions.length - 1));
}

function getSearchFields(session) {
  return [
    session.agent,
    session.id,
    session.cwd,
    formatProject(session),
    session.preview,
    session.metadata ? JSON.stringify(session.metadata) : "",
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function isPrintable(str, key) {
  return typeof str === "string" && str.length === 1 && !key?.ctrl && !key?.meta;
}
