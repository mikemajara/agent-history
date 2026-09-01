import { createRequire } from "node:module";
import { formatResumeCommand, formatSessionDetail, formatSessionTable } from "./format.js";
import { getStatuses, upsertAnnotation } from "./lib/annotations.js";
import { getAllSessions, getSessionsForCwd } from "./session-index.js";
import { resolveTargetCwd } from "./lib/path-utils.js";
import { upgradePackage } from "./lib/upgrade.js";
import { launchSession, runInteractiveBrowser } from "./tui.js";

const { name: packageName, version } = createRequire(import.meta.url)("../package.json");

const KNOWN_OPTIONS = new Set([
  "--help",
  "-h",
  "--version",
  "-v",
  "--last",
  "--new",
  "--no-preview",
  "--refresh",
  "--upgrade",
  "--clear",
]);

function helpText(statuses) {
  const statusValues = statuses.join("|");
  const statusCycle = ["none", ...statuses].join(" → ");
  return `agent-history ${version}
Find and resume AI agent sessions for the current repo or directory.

Usage:
  agent-history [path]        Interactive session browser (current directory by default)
  agent-history --last        Resume the most recent session in this directory
  agent-history --last --new  Start a fresh session with the last agent used here
  agent-history --upgrade     Install the latest version globally via npm
  agent-history ls [path]     Scriptable table of sessions
  agent-history show <id>     Detailed metadata for a session
  agent-history resume <id>   Print the resume command for a session
  agent-history pin <id>      Pin a session so it floats in the browser
  agent-history unpin <id>    Remove the pin
  agent-history status <id> [${statusValues}|--clear]
                              Show or set follow-up status

Also available as: ah

Options:
  --last                      Launch the newest session for the current directory
  --new                       With --last, start a new session instead of resuming
  --no-preview                Hide prompt/conversation text (list, ls, and details pane)
  --refresh                   Rebuild the local session cache before listing/browsing
  --upgrade                   Reinstall agent-history@latest with npm -g
  -h, --help                  Show this help
  -v, --version               Show version

Commands:
  cache clear                 Delete ~/.cache/agent-history/sessions-v1.json

Interactive controls:
  tab focus filter/sort       left/right change Cwd/All or Updated/Created
  up/down or j/k browse       / search, Ctrl+p preview
  Ctrl+b pin                  Ctrl+t cycle status ${statusCycle}
  Enter resume                Ctrl+n new in directory
  Esc exit/clear              Ctrl+C exit

Search: free text + dir:path date:today|yesterday|week|<Nh|<Nd
Press / to type in the bordered search field; empty placeholder lists what you can search.
Compact rows show: age · agent · meta · directory · prompt · turns
Preview pane (on by default): side split on wide terminals, stacked when narrow
--no-preview keeps metadata and search over agent/id/path/metadata; hides prompts
Pin/status: stored at ~/.local/share/agent-history/annotations-v1.json
  Override with AGENT_HISTORY_DATA_DIR; not affected by --refresh or cache clear
Statuses: ~/.config/agent-history/config.json  { "statuses": ["pending", "parked"] }
  Override path with AGENT_HISTORY_CONFIG; first entry floats and is counted in the footer

Cache:
  Session metadata is cached at ~/.cache/agent-history/sessions-v1.json
  Invalidates when provider transcript files change (path/mtime/size fingerprint)
  Override location with AGENT_HISTORY_CACHE_DIR; force rebuild with --refresh`;
}

export async function main(argv, io, options = {}) {
  const unknownOption = argv.find((arg) => arg.startsWith("-") && !KNOWN_OPTIONS.has(arg));
  if (unknownOption) {
    io.stderr.write(`Unknown option: ${unknownOption}\n`);
    process.exitCode = 1;
    return;
  }

  const refresh = argv.includes("--refresh") || options.refresh === true;
  const noPreview = argv.includes("--no-preview") || options.noPreview === true;
  const args = argv.filter((arg) => arg !== "--refresh" && arg !== "--no-preview");
  const [command, arg] = args;
  const statuses = getStatuses(options);
  options = { ...options, statuses };

  if (command === "--help" || command === "-h" || command === "help") {
    io.stdout.write(`${helpText(statuses)}\n`);
    return;
  }

  if (command === "--version" || command === "-v") {
    io.stdout.write(`${version}\n`);
    return;
  }

  if (argv.includes("--upgrade")) {
    if (argv.some((arg) => arg !== "--upgrade")) {
      io.stderr.write("`--upgrade` does not accept other arguments.\n");
      process.exitCode = 1;
      return;
    }

    const exitCode = await upgradePackage(io, {
      packageName,
      currentVersion: version,
      runNpm: options.runNpm,
    });
    process.exitCode = exitCode;
    return;
  }

  if (command === "cache") {
    if (arg === "clear") {
      const { clearSessionCache, getCachePath } = await import("./lib/session-cache.js");
      const cachePath = getCachePath(options);
      await clearSessionCache(cachePath);
      io.stdout.write(`Cleared session cache: ${cachePath}\n`);
      return;
    }
    io.stderr.write("Usage: agent-history cache clear\n");
    process.exitCode = 1;
    return;
  }

  if (args.includes("--last") || args.includes("--new")) {
    if (args.includes("--new") && !args.includes("--last")) {
      io.stderr.write("`--new` requires `--last` (example: agent-history --last --new).\n");
      process.exitCode = 1;
      return;
    }

    const exitCode = await resumeLastSession(io, {
      ...options,
      refresh,
      mode: args.includes("--new") ? "new" : "resume",
    });
    process.exitCode = exitCode;
    return;
  }

  if (!command) {
    const sessions = await loadAllSessions({ ...options, refresh });
    const browse = options.runInteractiveBrowser ?? runInteractiveBrowser;
    const exitCode = await browse(sessions, io, {
      ...options,
      currentCwd: await resolveTargetCwd(),
      noPreview,
    });
    process.exitCode = exitCode;
    return;
  }

  if (command === "ls") {
    const sessions = await getSessions(arg, { ...options, refresh });
    io.stdout.write(`${formatSessionTable(sessions, { noPreview })}\n`);
    return;
  }

  if (command === "show") {
    const session = await findSessionOrExit(arg, io, { ...options, refresh });
    if (!session) return;
    io.stdout.write(`${formatSessionDetail(session)}\n`);
    return;
  }

  if (command === "resume") {
    const session = await findSessionOrExit(arg, io, { ...options, refresh });
    if (!session) return;
    if (!session.resumeCommand) {
      io.stderr.write(`Session not found: ${arg ?? ""}\n`);
      process.exitCode = 1;
      return;
    }
    io.stdout.write(`${formatResumeCommand(session)}\n`);
    return;
  }

  if (command === "pin" || command === "unpin") {
    const session = await findSessionOrExit(arg, io, { ...options, refresh });
    if (!session) return;
    const pinned = command === "pin";
    const saved = await upsertAnnotation(session, { pinned }, options);
    applySavedAnnotation(session, saved);
    io.stdout.write(`${formatAnnotationLine(session)}\n`);
    return;
  }

  if (command === "status") {
    const clear = args.includes("--clear");
    const statusArgs = args.slice(1).filter((value) => value !== "--clear");
    const id = statusArgs[0];
    const value = statusArgs[1];
    const session = await findSessionOrExit(id, io, { ...options, refresh });
    if (!session) return;

    if (clear || value) {
      if (value && !statuses.includes(value)) {
        io.stderr.write(`Unknown status: ${value}. Use ${statuses.join(", ")}, or --clear.\n`);
        process.exitCode = 1;
        return;
      }
      const status = clear ? null : value;
      const saved = await upsertAnnotation(session, { status }, options);
      applySavedAnnotation(session, saved);
    }

    io.stdout.write(`${formatAnnotationLine(session)}\n`);
    return;
  }

  const sessions = await loadAllSessions({ ...options, refresh });
  const browse = options.runInteractiveBrowser ?? runInteractiveBrowser;
  const exitCode = await browse(sessions, io, {
    ...options,
    currentCwd: await resolveTargetCwd(command),
    noPreview,
  });
  process.exitCode = exitCode;
}

export async function resumeLastSession(io, options = {}) {
  const loadSessions = options.getSessionsForCwd ?? ((cwd) => getSessionsForCwd(cwd, options));
  const launch = options.launchSession ?? launchSession;
  const resolveCwd = options.resolveTargetCwd ?? resolveTargetCwd;
  const mode = options.mode === "new" ? "new" : "resume";
  const sessions = await loadSessions();
  const session = mode === "new"
    ? sessions.find((candidate) => candidate.agent)
    : sessions.find((candidate) => candidate.resumeCommand?.length);

  if (!session) {
    io.stderr.write(
      mode === "new"
        ? "No agent sessions found for this directory.\n"
        : "No resumable sessions found for this directory.\n",
    );
    return 1;
  }

  const cwd = session.cwd ?? await resolveCwd();
  return launch({ ...session, cwd }, io, { mode });
}

async function getSessions(pathArg, options = {}) {
  return pathArg ? getSessionsForCwd(pathArg, options) : loadAllSessions(options);
}

function loadAllSessions(options = {}) {
  const load = options.getAllSessions ?? getAllSessions;
  return load(options);
}

async function findSessionOrExit(inputId, io, options = {}) {
  if (!inputId) {
    io.stderr.write("Session not found: \n");
    process.exitCode = 1;
    return undefined;
  }

  const sessions = await loadAllSessions(options);
  const session = findSession(sessions, inputId);
  if (!session) {
    io.stderr.write(`Session not found: ${inputId}\n`);
    process.exitCode = 1;
    return undefined;
  }
  return session;
}

function formatAnnotationLine(session) {
  return [
    `id: ${session.id}`,
    `agent: ${session.agent}`,
    `pinned: ${session.pinned ? "yes" : "no"}`,
    `status: ${session.status ?? "-"}`,
  ].join("\n");
}

function applySavedAnnotation(session, saved) {
  session.pinned = saved?.pinned === true;
  session.status = saved?.status;
}

function findSession(sessions, inputId) {
  if (!inputId) {
    return undefined;
  }

  return sessions.find((session) => session.id === inputId || session.id.startsWith(inputId));
}
