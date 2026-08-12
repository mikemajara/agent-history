import { discoverAllClaudeSessions, discoverClaudeSessions } from "./providers/claude.js";
import { discoverCodexSessions } from "./providers/codex.js";
import { discoverAllCursorSessions, discoverCursorSessions } from "./providers/cursor.js";
import { discoverFxSessions } from "./providers/fx.js";
import { discoverOpenCodeSessions } from "./providers/opencode.js";
import { encodeClaudeProjectSlug, encodeCursorProjectSlug, resolveTargetCwd } from "./lib/path-utils.js";
import {
  clearSessionCache,
  collectSourceFingerprint,
  getCachePath,
  readSessionCache,
  writeSessionCache,
} from "./lib/session-cache.js";

/**
 * @param {string | undefined} inputCwd
 * @param {{ refresh?: boolean, cacheDir?: string, cache?: boolean }} [options]
 */
export async function getSessionsForCwd(inputCwd, options = {}) {
  const targetCwd = await resolveTargetCwd(inputCwd);
  if (options.cache === false) {
    return discoverSessionsForCwd(targetCwd);
  }

  const sessions = await getAllSessions(options);
  return sessions.filter((session) => matchesSessionCwd(session, targetCwd)).sort(compareSessionsDesc);
}

/**
 * @param {{ refresh?: boolean, cacheDir?: string, cache?: boolean }} [options]
 */
export async function getAllSessions(options = {}) {
  if (options.cache === false) {
    return discoverAllSessionsUncached();
  }

  const cachePath = getCachePath(options);
  const fingerprint = await collectSourceFingerprint();

  if (!options.refresh) {
    const cached = await readSessionCache(cachePath, fingerprint);
    if (cached) {
      return cached.sort(compareSessionsDesc);
    }
  }

  const sessions = await discoverAllSessionsUncached();
  try {
    await writeSessionCache(cachePath, sessions, fingerprint);
  } catch {
    // Cache write failures must not break listing/browsing.
  }
  return sessions;
}

/**
 * Force-clear the on-disk session cache.
 * @param {{ cacheDir?: string }} [options]
 */
export async function refreshSessionCache(options = {}) {
  await clearSessionCache(getCachePath(options));
  return getAllSessions({ ...options, refresh: true });
}

export function matchesSessionCwd(session, targetCwd) {
  if (!targetCwd) {
    return true;
  }

  if (session.cwd) {
    return session.cwd === targetCwd;
  }

  const projectSlug = session.metadata?.projectSlug;
  if (!projectSlug) {
    return false;
  }

  if (session.agent === "cursor") {
    return projectSlug === encodeCursorProjectSlug(targetCwd);
  }

  if (session.agent === "claude") {
    return projectSlug === encodeClaudeProjectSlug(targetCwd);
  }

  return false;
}

async function discoverAllSessionsUncached() {
  const [cursor, claude, codex, opencode, fx] = await Promise.all([
    discoverAllCursorSessions(),
    discoverAllClaudeSessions(),
    discoverCodexSessions(),
    discoverOpenCodeSessions(),
    discoverFxSessions(),
  ]);

  return [...cursor, ...claude, ...codex, ...opencode, ...fx].sort(compareSessionsDesc);
}

async function discoverSessionsForCwd(targetCwd) {
  const [cursor, claude, codex, opencode, fx] = await Promise.all([
    discoverCursorSessions(targetCwd),
    discoverClaudeSessions(targetCwd),
    discoverCodexSessions(targetCwd),
    discoverOpenCodeSessions(targetCwd),
    discoverFxSessions(targetCwd),
  ]);

  return [...cursor, ...claude, ...codex, ...opencode, ...fx].sort(compareSessionsDesc);
}

function compareSessionsDesc(left, right) {
  const leftValue = left.updatedAt?.getTime() ?? left.startedAt?.getTime() ?? 0;
  const rightValue = right.updatedAt?.getTime() ?? right.startedAt?.getTime() ?? 0;
  return rightValue - leftValue;
}
