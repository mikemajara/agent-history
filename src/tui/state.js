import { formatProject } from "../format.js";
import { annotationRank, DEFAULT_STATUSES, nextStatus } from "../lib/annotations.js";
import { matchesQueryTokens, parseQuery } from "../lib/query.js";
import { search } from "../lib/search.js";
import { matchesSessionCwd } from "../session-index.js";

export function createBrowserState(sessions, options = {}) {
  return {
    sessions,
    currentCwd: options.currentCwd,
    scope: options.initialScope ?? (options.currentCwd ? "cwd" : "all"),
    sort: "updated",
    focusedControl: "filter",
    selectedIndex: 0,
    selectedId: sessions[0]?.id,
    previewPane: true,
    noPreview: options.noPreview === true,
    mode: "normal",
    search: "",
    message: "",
    searchIndex: null,
    indexing: false,
    rankedSessions: null,
    snippetMap: new Map(),
    now: options.now,
    statuses: Array.isArray(options.statuses) && options.statuses.length
      ? options.statuses
      : undefined,
  };
}

export function getVisibleSessions(state) {
  const now = state.now ?? new Date();
  const scopedSessions = getScopedSessions(state);
  const parsed = parseQuery(state.search, now);
  const tokenFiltered = scopedSessions.filter((session) => matchesQueryTokens(session, parsed, now));
  let visibleSessions = tokenFiltered;

  if (parsed.freeText && state.rankedSessions !== null) {
    const allowed = new Set(tokenFiltered);
    visibleSessions = state.rankedSessions.filter((session) => allowed.has(session));
  } else if (parsed.freeText) {
    // Fallback substring filter while index is loading
    const query = parsed.freeText.toLowerCase();
    visibleSessions = tokenFiltered.filter((session) => getSearchFields(session).some((value) => value.includes(query)));
  }

  return sortSessions(visibleSessions, state.sort, statusesOf(state));
}

export function getScopedSessions(state) {
  if (state.scope !== "cwd" || !state.currentCwd) {
    return state.sessions;
  }

  return state.sessions.filter((session) => matchesSessionCwd(session, state.currentCwd));
}

export function leadStatus(state) {
  return statusesOf(state)[0];
}

function statusesOf(state) {
  return state.statuses?.length ? state.statuses : DEFAULT_STATUSES;
}

export function countPendingInScope(state) {
  const lead = statusesOf(state)[0];
  return getScopedSessions(state).filter((session) => session.status === lead).length;
}

export function setSearchIndex(state, index) {
  state.searchIndex = index;
  state.indexing = false;
  updateSearchResults(state);
}

function updateSearchResults(state) {
  const parsed = parseQuery(state.search, state.now ?? new Date());
  if (!parsed.freeText || !state.searchIndex) {
    state.rankedSessions = null;
    state.snippetMap = new Map();
    return;
  }

  const results = search(state.searchIndex, parsed.freeText, state.sessions);
  state.rankedSessions = results.map((r) => r.session);
  state.snippetMap = new Map(
    results.map((r) => [r.session.id, r.snippet]).filter(([, v]) => v),
  );
}

function sortSessions(sessions, sort, statuses = DEFAULT_STATUSES) {
  const valueFor = (session) => {
    if (sort === "created") {
      return session.startedAt?.getTime() ?? session.updatedAt?.getTime() ?? 0;
    }

    return session.updatedAt?.getTime() ?? session.startedAt?.getTime() ?? 0;
  };

  return [...sessions].sort((left, right) => {
    const rank = annotationRank(left, statuses) - annotationRank(right, statuses);
    if (rank !== 0) return rank;
    return valueFor(right) - valueFor(left) || left.id.localeCompare(right.id);
  });
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
  if (isLetterKey(str, key, "q")) {
    return "exit";
  }

  if (key?.name === "escape") {
    if (state.search) {
      clearSearch(state);
      return "render";
    }

    return "exit";
  }

  if (isDownKey(str, key) || isLetterKey(str, key, "j")) {
    moveSelection(state, 1, visibleSessions);
    return "render";
  }

  if (isUpKey(str, key) || isLetterKey(str, key, "k")) {
    moveSelection(state, -1, visibleSessions);
    return "render";
  }

  if (key?.ctrl && key.name === "p") {
    state.previewPane = !state.previewPane;
    return "render";
  }

  if (key?.ctrl && key.name === "b") {
    return toggleSelectedPin(state, visibleSessions);
  }

  if (key?.ctrl && key.name === "t") {
    return cycleSelectedStatus(state, visibleSessions);
  }

  if (key?.ctrl && key.name === "n") {
    return "select-new";
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

  if (isSlash(str, key)) {
    state.mode = "search";
    state.message = "";
    return "render";
  }

  if (str === "?" || key?.sequence === "?") {
    state.message =
      "Controls: j/k/arrows navigate, / search, Ctrl+b pin, Ctrl+t status, Ctrl+p toggle preview pane, Enter resume, Ctrl+n new in directory, Esc clear+leave search, Ctrl+u clear, q quit | Rows: age · agent · meta · directory · prompt · turns | Search: free text + dir:path date:today|yesterday|week|<Nh|<Nd (preview jumps to matches)";
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
    clampSelection(state, getVisibleSessions(state));
    return "select";
  }

  if (key?.ctrl && key.name === "n") {
    clampSelection(state, getVisibleSessions(state));
    return "select-new";
  }

  if (key?.ctrl && key.name === "p") {
    state.previewPane = !state.previewPane;
    return "render";
  }

  if (key?.ctrl && key.name === "b") {
    return toggleSelectedPin(state, visibleSessions);
  }

  if (key?.ctrl && key.name === "t") {
    return cycleSelectedStatus(state, visibleSessions);
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

  if (isBackspace(str, key)) {
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

  if (isDownKey(str, key)) {
    moveSelection(state, 1, visibleSessions);
    return "render";
  }

  if (isUpKey(str, key)) {
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

function toggleSelectedPin(state, visibleSessions) {
  const session = visibleSessions[state.selectedIndex];
  if (!session) return "ignore";
  session.pinned = !session.pinned;
  state.selectedId = session.id;
  clampSelection(state);
  return "annotate";
}

function cycleSelectedStatus(state, visibleSessions) {
  const session = visibleSessions[state.selectedIndex];
  if (!session) return "ignore";
  session.status = nextStatus(session.status, statusesOf(state));
  state.selectedId = session.id;
  clampSelection(state);
  return "annotate";
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

function isDownKey(str, key) {
  const sequence = str || key?.sequence;
  return key?.name === "down" || sequence === "\x1b[B" || sequence === "\x1bOB";
}

function isUpKey(str, key) {
  const sequence = str || key?.sequence;
  return key?.name === "up" || sequence === "\x1b[A" || sequence === "\x1bOA";
}

function isLetterKey(str, key, letter) {
  if (key?.ctrl || key?.meta) return false;
  return [str, key?.name, key?.sequence].some((value) => (
    typeof value === "string" && value.toLowerCase() === letter
  ));
}

function isSlash(str, key) {
  if (key?.ctrl || key?.meta) return false;
  return str === "/" || key?.sequence === "/" || key?.name === "/";
}

function isBackspace(str, key) {
  return key?.name === "backspace"
    || key?.name === "delete"
    || str === "\x7f"
    || str === "\b";
}

function isPrintable(str, key) {
  return typeof str === "string" && str.length === 1 && !key?.ctrl && !key?.meta;
}
