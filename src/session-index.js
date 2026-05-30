import { discoverAllClaudeSessions, discoverClaudeSessions } from "./providers/claude.js";
import { discoverCodexSessions } from "./providers/codex.js";
import { discoverAllCursorSessions, discoverCursorSessions } from "./providers/cursor.js";
import { resolveTargetCwd } from "./lib/path-utils.js";

export async function getSessionsForCwd(inputCwd) {
  const targetCwd = await resolveTargetCwd(inputCwd);
  const [cursor, claude, codex] = await Promise.all([
    discoverCursorSessions(targetCwd),
    discoverClaudeSessions(targetCwd),
    discoverCodexSessions(targetCwd),
  ]);

  return [...cursor, ...claude, ...codex].sort(compareSessionsDesc);
}

export async function getAllSessions() {
  const [cursor, claude, codex] = await Promise.all([
    discoverAllCursorSessions(),
    discoverAllClaudeSessions(),
    discoverCodexSessions(),
  ]);

  return [...cursor, ...claude, ...codex].sort(compareSessionsDesc);
}

function compareSessionsDesc(left, right) {
  const leftValue = left.updatedAt?.getTime() ?? left.startedAt?.getTime() ?? 0;
  const rightValue = right.updatedAt?.getTime() ?? right.startedAt?.getTime() ?? 0;
  return rightValue - leftValue;
}
