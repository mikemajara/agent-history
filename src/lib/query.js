import { formatProject } from "../format.js";

const TOKEN_RE = /^(dir|date):(\S*)$/i;

/**
 * Parse in-query filter tokens from a search string.
 * Known tokens: dir:, date:. Remaining text is free-text search.
 * Invalid date values are dropped (no crash, no hard empty).
 *
 * @param {string} query
 * @param {Date} [now]
 * @returns {{ freeText: string, dir: string | null, date: { kind: string, value?: number } | null }}
 */
export function parseQuery(query, now = new Date()) {
  const parts = String(query ?? "").trim().split(/\s+/).filter(Boolean);
  const freeParts = [];
  let dir = null;
  let date = null;

  for (const part of parts) {
    const match = TOKEN_RE.exec(part);
    if (!match) {
      freeParts.push(part);
      continue;
    }

    const kind = match[1].toLowerCase();
    const value = match[2];

    if (kind === "dir") {
      if (value) dir = value;
      continue;
    }

    if (kind === "date") {
      const parsed = parseDateToken(value, now);
      if (parsed) date = parsed;
      continue;
    }
  }

  return {
    freeText: freeParts.join(" "),
    dir,
    date,
  };
}

/**
 * @param {import("../types.js").AgentSession} session
 * @param {{ freeText: string, dir: string | null, date: { kind: string, value?: number } | null }} parsed
 * @param {Date} [now]
 */
export function matchesQueryTokens(session, parsed, now = new Date()) {
  if (parsed.dir && !matchesDirToken(session, parsed.dir)) {
    return false;
  }

  if (parsed.date && !matchesDateToken(session, parsed.date, now)) {
    return false;
  }

  return true;
}

function matchesDirToken(session, dir) {
  const needle = dir.toLowerCase();
  return getDirFields(session).some((value) => value.includes(needle));
}

function getDirFields(session) {
  return [
    session.cwd,
    formatProject(session),
    session.metadata?.projectSlug,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function matchesDateToken(session, dateFilter, now) {
  const timestamp = session.updatedAt ?? session.startedAt;
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    return false;
  }

  if (dateFilter.kind === "today") {
    return sameLocalDay(timestamp, now);
  }

  if (dateFilter.kind === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return sameLocalDay(timestamp, yesterday);
  }

  if (dateFilter.kind === "since") {
    return timestamp.getTime() >= dateFilter.value;
  }

  return false;
}

function parseDateToken(value, now) {
  if (!value) return null;

  const normalized = value.toLowerCase();

  if (normalized === "today") {
    return { kind: "today" };
  }

  if (normalized === "yesterday") {
    return { kind: "yesterday" };
  }

  if (normalized === "week") {
    return { kind: "since", value: now.getTime() - 7 * 24 * 60 * 60 * 1000 };
  }

  const relative = /^<(\d+)([hd])$/.exec(normalized);
  if (relative) {
    const amount = Number(relative[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const ms = relative[2] === "h" ? amount * 60 * 60 * 1000 : amount * 24 * 60 * 60 * 1000;
    return { kind: "since", value: now.getTime() - ms };
  }

  return null;
}

function sameLocalDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}
