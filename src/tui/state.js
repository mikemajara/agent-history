import { formatProject } from "../format.js";
import { search } from "../lib/search.js";
import { matchesSessionCwd } from "../session-index.js";

export function createBrowserState(sessions, options = {}) {
  return {
    sessions,
    currentCwd: options.currentCwd,
    scope: options.initialScope ?? "all",
    sort: "updated",
    focusedControl: "filter",
    selectedIndex: 0,
    selectedId: sessions[0]?.id,
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
  const scopedSessions = getScopedSessions(state);
  let visibleSessions = scopedSessions;

  if (state.search && state.rankedSessions !== null) {
    const allowed = new Set(scopedSessions);
    visibleSessions = state.rankedSessions.filter((session) => allowed.has(session));
  } else if (state.search) {
    // Fallback substring filter while index is loading
    const query = state.search.toLowerCase();
    visibleSessions = scopedSessions.filter((session) => getSearchFields(session).some((value) => value.includes(query)));
  }

  return sortSessions(visibleSessions, state.sort);
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

function getScopedSessions(state) {
  if (state.scope !== "cwd" || !state.currentCwd) {
    return state.sessions;
  }

  return state.sessions.filter((session) => matchesSessionCwd(session, state.currentCwd));
}

function sortSessions(sessions, sort) {
  const valueFor = (session) => {
    if (sort === "created") {
      return session.startedAt?.getTime() ?? session.updatedAt?.getTime() ?? 0;
    }

    return session.updatedAt?.getTime() ?? session.startedAt?.getTime() ?? 0;
  };

  return [...sessions].sort((left, right) => valueFor(right) - valueFor(left) || left.id.localeCompare(right.id));
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

  if (key?.name === "escape") {
    if (state.expanded) {
      state.expanded = false;
      return "render";
    }

    if (state.search) {
      clearSearch(state);
      return "render";
    }

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
    clearSearch(state);
    return "render";
  }

  if (key?.name === "tab") {
    state.focusedControl = state.focusedControl === "filter" ? "sort" : "filter";
    return "render";
  }

  if (key?.name === "left" || key?.name === "right") {
    if (state.focusedControl === "filter") {
      state.scope = state.scope === "all" ? "cwd" : "all";
    } else {
      state.sort = state.sort === "updated" ? "created" : "updated";
    }
    syncSelectedId(state, getVisibleSessions(state));
    return "render";
  }

  if (str === "/") {
    state.mode = "search";
    state.message = "";
    return "render";
  }

  if (str === "?") {
    state.message =
      "Controls: j/k/arrows navigate, Ctrl+e details panel, Enter print resume, / search, Esc clear+leave search, Ctrl+u clear, q quit | Search matches all conversation text";
    return "render";
  }

  if (key?.name === "return") {
    return "select";
  }

  if (isPrintable(str, key)) {
    state.search += str;
    state.selectedIndex = 0;
    updateSearchResults(state);
    state.selectedId = getVisibleSessions(state)[0]?.id;
    return "render";
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

  if (key?.name === "tab") {
    state.focusedControl = state.focusedControl === "filter" ? "sort" : "filter";
    return "render";
  }

  if (key?.name === "left" || key?.name === "right") {
    if (state.focusedControl === "filter") {
      state.scope = state.scope === "all" ? "cwd" : "all";
    } else {
      state.sort = state.sort === "updated" ? "created" : "updated";
    }
    syncSelectedId(state, getVisibleSessions(state));
    return "render";
  }

  if (key?.name === "backspace" || key?.name === "delete") {
    state.search = state.search.slice(0, -1);
    state.selectedIndex = 0;
    updateSearchResults(state);
    state.selectedId = getVisibleSessions(state)[0]?.id;
    return "render";
  }

  if (key?.ctrl && key.name === "u") {
    clearSearch(state);
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
    state.selectedId = getVisibleSessions(state)[0]?.id;
    return "render";
  }

  return "ignore";
}

function moveSelection(state, delta, visibleSessions) {
  state.selectedIndex += delta;
  state.selectedId = undefined;
  clampSelection(state, visibleSessions);
}

export function clampSelection(state, visibleSessions = getVisibleSessions(state)) {
  if (visibleSessions.length === 0) {
    state.selectedIndex = 0;
    state.selectedId = undefined;
    return;
  }

  const selectedIndex = state.selectedId ? visibleSessions.findIndex((session) => session.id === state.selectedId) : -1;
  state.selectedIndex = selectedIndex >= 0
    ? selectedIndex
    : Math.max(0, Math.min(state.selectedIndex, visibleSessions.length - 1));
  state.selectedId = visibleSessions[state.selectedIndex]?.id;
}

function syncSelectedId(state, visibleSessions) {
  clampSelection(state, visibleSessions);
}

function clearSearch(state) {
  state.search = "";
  state.selectedIndex = 0;
  state.message = "";
  state.rankedSessions = null;
  state.snippetMap = new Map();
  state.selectedId = getVisibleSessions(state)[0]?.id;
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
