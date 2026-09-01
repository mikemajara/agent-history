import readline from "node:readline";
import { spawn } from "node:child_process";
import { upsertAnnotation } from "./lib/annotations.js";
import { createBrowserState, getVisibleSessions, handleBrowserInput, setSearchIndex } from "./tui/state.js";
import { renderBrowserFrame } from "./tui/render.js";
import { getLaunchCommand } from "./lib/launch-command.js";
import { buildIndex } from "./lib/search.js";

export async function runInteractiveBrowser(sessions, io, options = {}) {
  if (!io.stdin.isTTY || !io.stdout.isTTY) {
    io.stderr.write("Interactive mode requires a TTY. Use `agent-history ls` in non-interactive shells.\n");
    return 1;
  }

  if (sessions.length === 0) {
    io.stdout.write("No sessions found.\n");
    return 0;
  }

  const state = createBrowserState(sessions, options);
  const launch = options.launchSession ?? launchSession;
  const persistAnnotation = options.persistAnnotation ?? ((session) => upsertAnnotation(session, {
    pinned: session.pinned === true,
    status: session.status ?? null,
  }, options));
  state.indexing = true;

  readline.emitKeypressEvents(io.stdin);
  io.stdin.setRawMode(true);
  io.stdin.resume();

  let onKeypress = undefined;
  let onResize = undefined;
  let active = true;

  const cleanup = () => {
    active = false;
    if (onKeypress) {
      io.stdin.off("keypress", onKeypress);
    }
    if (onResize) {
      process.off("SIGWINCH", onResize);
    }
    io.stdin.setRawMode(false);
    io.stdin.pause();
    // Leave the alternate screen so the prior scrollback/prompt is restored.
    io.stdout.write("\x1b[?25h\x1b[?1049l");
  };

  // Draw on the alternate screen so quitting restores the user's prior terminal.
  io.stdout.write("\x1b[?1049h\x1b[?25l\x1b[H");

  const render = () => {
    const width = Math.max(io.stdout.columns ?? 100, 60);
    const height = Math.max(io.stdout.rows ?? 24, 10);
    io.stdout.write(`\x1b[H${renderBrowserFrame(state, width, height)}\x1b[J`);
  };

  render();
  onResize = () => {
    if (active) render();
  };
  process.on("SIGWINCH", onResize);

  buildIndex(sessions).then((index) => {
    if (!active) return;
    setSearchIndex(state, index);
    render();
  });

  return await new Promise((resolve) => {
    onKeypress = (str, key) => {
      const action = handleBrowserInput(state, str, key);

      if (action === "exit-interrupted") {
        cleanup();
        io.stdout.write("\n");
        resolve(130);
        return;
      }

      if (action === "exit") {
        cleanup();
        resolve(0);
        return;
      }

      if (action === "select" || action === "select-new") {
        const visibleSessions = getVisibleSessions(state);
        const selected = visibleSessions[state.selectedIndex];
        const mode = action === "select-new" ? "new" : "resume";
        if (selected && getLaunchCommand(selected, mode)) {
          cleanup();
          launch(selected, io, { mode }).then(resolve, (error) => {
            const verb = mode === "new" ? "start" : "resume";
            io.stderr.write(`Failed to ${verb} session: ${error.message}\n`);
            resolve(1);
          });
        }
        return;
      }

      if (action === "annotate") {
        const visibleSessions = getVisibleSessions(state);
        const selected = visibleSessions[state.selectedIndex];
        render();
        if (selected) {
          Promise.resolve(persistAnnotation(selected)).catch((error) => {
            if (!active) return;
            state.message = `Failed to save annotation: ${error.message}`;
            render();
          });
        }
        return;
      }

      if (action === "render") {
        render();
      }
    };

    io.stdin.on("keypress", onKeypress);
  });
}

export function launchSession(session, io, options = {}) {
  const mode = options.mode === "new" ? "new" : "resume";
  const launchCommand = getLaunchCommand(session, mode);

  if (!launchCommand?.length) {
    const message = mode === "new"
      ? `No new-session command for agent: ${session?.agent ?? "unknown"}`
      : "Session has no resume command";
    io.stderr.write(`${message}\n`);
    return Promise.resolve(1);
  }

  if (mode === "new" && !session?.cwd) {
    io.stderr.write("Cannot start a new session without a project directory.\n");
    return Promise.resolve(1);
  }

  const [command, ...args] = launchCommand;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: session.cwd,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      io.stderr.write(`Failed to launch ${command}: ${error.message}\n`);
      resolve(1);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

export { renderBrowserFrame };
