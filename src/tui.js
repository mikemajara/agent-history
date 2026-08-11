import readline from "node:readline";
import { spawn } from "node:child_process";
import { clampSelection, createBrowserState, getVisibleSessions, handleBrowserInput, setSearchIndex } from "./tui/state.js";
import { renderBrowserFrame } from "./tui/render.js";
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
    io.stdout.write("\x1b[2J\x1b[H\x1b[?25h");
  };

  io.stdout.write("\x1b[?25l\x1b[2J\x1b[H");

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
        io.stdout.write("\n");
        cleanup();
        resolve(130);
        return;
      }

      if (action === "exit") {
        cleanup();
        resolve(0);
        return;
      }

      if (action === "select") {
        const visibleSessions = getVisibleSessions(state);
        const selected = visibleSessions[state.selectedIndex];
        if (selected?.resumeCommand) {
          cleanup();
          launch(selected, io).then(resolve, (error) => {
            io.stderr.write(`Failed to resume session: ${error.message}\n`);
            resolve(1);
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

export function launchSession(session, io) {
  const [command, ...args] = session.resumeCommand;

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
