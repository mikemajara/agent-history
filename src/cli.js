import { createRequire } from "node:module";
import { formatResumeCommand, formatSessionDetail, formatSessionTable } from "./format.js";
import { getAllSessions, getSessionsForCwd } from "./session-index.js";
import { resolveTargetCwd } from "./lib/path-utils.js";
import { launchSession, runInteractiveBrowser } from "./tui.js";

const { version } = createRequire(import.meta.url)("../package.json");

const HELP_TEXT = `agent-history ${version}
Find and resume AI agent sessions for the current repo or directory.

Usage:
  agent-history [path]        Interactive session browser (current directory by default)
  agent-history --last        Resume the most recent session in this directory
  agent-history ls [path]     Scriptable table of sessions
  agent-history show <id>     Detailed metadata for a session
  agent-history resume <id>   Print the resume command for a session

Also available as: ah

Options:
  --last                      Launch the newest session for the current directory
  -h, --help                  Show this help
  -v, --version               Show version

Interactive controls:
  tab focus filter/sort       left/right change Cwd/All or Updated/Created
  up/down or j/k browse       type to search, / search, Ctrl+e details
  Enter resume                Esc exit/clear, Ctrl+C exit`;

export async function main(argv, io, options = {}) {
  const [command, arg] = argv;

  if (command === "--help" || command === "-h" || command === "help") {
    io.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  if (command === "--version" || command === "-v") {
    io.stdout.write(`${version}\n`);
    return;
  }

  if (argv.includes("--last")) {
    const exitCode = await resumeLastSession(io, options);
    process.exitCode = exitCode;
    return;
  }

  if (!command) {
    const sessions = await getAllSessions();
    const exitCode = await runInteractiveBrowser(sessions, io, {
      currentCwd: await resolveTargetCwd(),
    });
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

  const sessions = await getAllSessions();
  const exitCode = await runInteractiveBrowser(sessions, io, {
    currentCwd: await resolveTargetCwd(command),
  });
  process.exitCode = exitCode;
}

export async function resumeLastSession(io, options = {}) {
  const loadSessions = options.getSessionsForCwd ?? getSessionsForCwd;
  const launch = options.launchSession ?? launchSession;
  const sessions = await loadSessions();
  const session = sessions.find((candidate) => candidate.resumeCommand?.length);

  if (!session) {
    io.stderr.write("No resumable sessions found for this directory.\n");
    return 1;
  }

  return launch(session, io);
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
