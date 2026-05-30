import { formatProject } from "../format.js";

export function createBrowserState(sessions) {
  return {
    sessions,
    selectedIndex: 0,
    expanded: false,
    mode: "normal",
    search: "",
    message: "",
  };
}

export function getVisibleSessions(state) {
  if (!state.search) {
    return state.sessions;
  }

  const query = state.search.toLowerCase();
  return state.sessions.filter((session) => getSearchFields(session).some((value) => value.includes(query)));
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

  if (key?.name === "down") {
    moveSelection(state, 1, visibleSessions);
    return "render";
  }

  if (key?.name === "up") {
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
    return "render";
  }

  if (str === "/") {
    state.mode = "search";
    state.message = "";
    return "render";
  }

  if (str === "?") {
    state.message = "Controls: arrows navigate, Enter print resume, / search, Esc clear+leave search, Ctrl+u clear, q quit";
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
    return "render";
  }

  if (key?.ctrl && key.name === "u") {
    state.search = "";
    state.selectedIndex = 0;
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
