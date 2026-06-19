import { createRequire } from "node:module";
import { formatResumeCommand, formatSessionDetail, formatSessionTable } from "./format.js";
import { getAllSessions, getSessionsForCwd } from "./session-index.js";
import { runInteractiveBrowser } from "./tui.js";

const { version } = createRequire(import.meta.url)("../package.json");

const HELP_TEXT = `agent-history ${version}
Find and resume AI agent sessions for the current repo or directory.

Usage:
  agent-history [path]        Interactive session browser (all projects, or filtered by path)
  agent-history ls [path]     Scriptable table of sessions
  agent-history show <id>     Detailed metadata for a session
  agent-history resume <id>   Print the resume command for a session

Options:
  -h, --help                  Show this help
  -v, --version               Show version`;

export async function main(argv, io) {
  const [command, arg] = argv;

  if (command === "--help" || command === "-h" || command === "help") {
    io.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  if (command === "--version" || command === "-v") {
    io.stdout.write(`${version}\n`);
    return;
  }

  if (!command) {
    const sessions = await getAllSessions();
    const exitCode = await runInteractiveBrowser(sessions, io);
    process.exitCode = exitCode;
    return;
  }

  if (command === "ls") {
    const sessions = await getSessions(arg);
    io.stdout.write(`${formatSessionTable(sessions)}\n`);
    return;
  }

  if (command === "show") {
    const sessions = await getAllSessions();
    const session = findSession(sessions, arg);
    if (!session) {
      io.stderr.write(`Session not found: ${arg ?? ""}\n`);
      process.exitCode = 1;
      return;
    }

    io.stdout.write(`${formatSessionDetail(session)}\n`);
    return;
  }

  if (command === "resume") {
    const sessions = await getAllSessions();
    const session = findSession(sessions, arg);
    if (!session?.resumeCommand) {
      io.stderr.write(`Session not found: ${arg ?? ""}\n`);
      process.exitCode = 1;
      return;
    }

    io.stdout.write(`${formatResumeCommand(session)}\n`);
    return;
  }

  const sessions = await getSessionsForCwd(command);
  const exitCode = await runInteractiveBrowser(sessions, io);
  process.exitCode = exitCode;
}

async function getSessions(pathArg) {
  return pathArg ? getSessionsForCwd(pathArg) : getAllSessions();
}

function findSession(sessions, inputId) {
  if (!inputId) {
    return undefined;
  }

  return sessions.find((session) => session.id === inputId || session.id.startsWith(inputId));
}
