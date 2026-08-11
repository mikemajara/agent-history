const NEW_SESSION_COMMANDS = {
  claude: ["claude"],
  cursor: ["cursor-agent"],
  codex: ["codex"],
  opencode: ["opencode"],
};

/**
 * @param {import("../types.js").AgentSession | { agent?: string, resumeCommand?: string[] }} session
 * @param {"resume" | "new"} [mode]
 * @returns {string[] | undefined}
 */
export function getLaunchCommand(session, mode = "resume") {
  if (mode === "new") {
    return newSessionCommandForAgent(session?.agent);
  }

  return session?.resumeCommand;
}

/**
 * @param {string | undefined} agent
 * @returns {string[] | undefined}
 */
export function newSessionCommandForAgent(agent) {
  if (!agent || !(agent in NEW_SESSION_COMMANDS)) {
    return undefined;
  }

  return [...NEW_SESSION_COMMANDS[agent]];
}
