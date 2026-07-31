import { discoverAllClaudeSessions, discoverClaudeSessions } from "./providers/claude.js";
import { discoverCodexSessions } from "./providers/codex.js";
import { discoverAllCursorSessions, discoverCursorSessions } from "./providers/cursor.js";
import { discoverOpenCodeSessions } from "./providers/opencode.js";
import { encodeClaudeProjectSlug, encodeCursorProjectSlug, resolveTargetCwd } from "./lib/path-utils.js";

export async function getSessionsForCwd(inputCwd) {
  const targetCwd = await resolveTargetCwd(inputCwd);
  const [cursor, claude, codex, opencode] = await Promise.all([
    discoverCursorSessions(targetCwd),
    discoverClaudeSessions(targetCwd),
    discoverCodexSessions(targetCwd),
    discoverOpenCodeSessions(targetCwd),
  ]);

  return [...cursor, ...claude, ...codex, ...opencode].sort(compareSessionsDesc);
}

export async function getAllSessions() {
  const [cursor, claude, codex, opencode] = await Promise.all([
    discoverAllCursorSessions(),
    discoverAllClaudeSessions(),
    discoverCodexSessions(),
    discoverOpenCodeSessions(),
  ]);

  return [...cursor, ...claude, ...codex, ...opencode].sort(compareSessionsDesc);
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

function compareSessionsDesc(left, right) {
  const leftValue = left.updatedAt?.getTime() ?? left.startedAt?.getTime() ?? 0;
  const rightValue = right.updatedAt?.getTime() ?? right.startedAt?.getTime() ?? 0;
  return rightValue - leftValue;
}
