import { formatSessionDetail, formatSessionTable } from "./format.js";
import { getAllSessions, getSessionsForCwd } from "./session-index.js";
import { runInteractiveBrowser } from "./tui.js";

export async function main(argv, io) {
  const [command, arg] = argv;

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

    io.stdout.write(`${session.resumeCommand.join(" ")}\n`);
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
