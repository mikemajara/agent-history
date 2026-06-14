import readline from "node:readline";
import { formatCompactDate, formatProject, shortenId } from "./format.js";
import { clampSelection, createBrowserState, getVisibleSessions, handleBrowserInput } from "./tui/state.js";

export async function runInteractiveBrowser(sessions, io) {
  if (!io.stdin.isTTY || !io.stdout.isTTY) {
    io.stderr.write("Interactive mode requires a TTY. Use `agent-history ls` in non-interactive shells.\n");
    return 1;
  }

  if (sessions.length === 0) {
    io.stdout.write("No sessions found.\n");
    return 0;
  }

  const state = createBrowserState(sessions);

  readline.emitKeypressEvents(io.stdin);
  io.stdin.setRawMode(true);
  io.stdin.resume();

  let onKeypress = undefined;

  const cleanup = () => {
    if (onKeypress) {
      io.stdin.off("keypress", onKeypress);
    }
    io.stdin.setRawMode(false);
    io.stdin.pause();
    io.stdout.write("\x1b[2J\x1b[H\x1b[?25h");
  };

  io.stdout.write("\x1b[?25l\x1b[2J\x1b[H");

  const render = () => {
    const visibleSessions = getVisibleSessions(state);
    clampSelection(state, visibleSessions);

    const width = Math.max(io.stdout.columns ?? 100, 60);
    const height = Math.max(io.stdout.rows ?? 24, 10);
    const lines = [];

    lines.push("agent-history");
    lines.push("j/k/arrows move, Enter prints resume command, Ctrl+e details, / search, q exits");
    lines.push("");

    const cursor = state.mode === "search" ? "_" : "";
    const matchCount = visibleSessions.length;
    lines.push(`search: ${state.search}${cursor} (${matchCount} match${matchCount === 1 ? "" : "es"})`);
    lines.push("");

    if (state.message) {
      lines.push(state.message);
      lines.push("");
    }

    const maxRows = Math.max(height - lines.length - 2, 1);
    const start = Math.max(0, Math.min(state.selectedIndex - Math.floor(maxRows / 2), visibleSessions.length - maxRows));
    const visibleWindow = visibleSessions.slice(start, start + maxRows);

    visibleWindow.forEach((session, windowIndex) => {
      const index = start + windowIndex;
      const prefix = index === state.selectedIndex ? "> " : "  ";
      const fixed = `${prefix}${session.agent.padEnd(6)} ${formatCompactDate(session.updatedAt ?? session.startedAt).padEnd(16)} ${shortenId(session.id).padEnd(6)} `;
      const project = truncateMiddle(formatProject(session), 38);
      lines.push(truncateRight(`${fixed}${project}  ${session.preview ?? "-"}`, width));

      if (state.expanded && index === state.selectedIndex) {
        lines.push(truncateRight(`    cwd: ${session.cwd ?? "-"}`, width));
        lines.push(truncateRight(`    file: ${session.transcriptPath ?? "-"}`, width));
        lines.push(truncateRight(`    resume: ${session.resumeCommand?.join(" ") ?? "-"}`, width));
      }
    });

    if (visibleSessions.length === 0) {
      lines.push("No matching sessions.");
    }

    const clippedLines = lines
      .slice(0, height - 1)
      .map((line) => formatFrameLine(line, width));
    io.stdout.write(`\x1b[H${clippedLines.join("\n")}\x1b[J`);
  };

  render();

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
          io.stdout.write(`${selected.resumeCommand.join(" ")}\n`);
          resolve(0);
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

function truncateRight(value, width) {
  const text = String(value ?? "");
  return text.length > width ? `${text.slice(0, Math.max(width - 3, 0))}...` : text;
}

function formatFrameLine(value, width) {
  return truncateRight(value, width).padEnd(width, " ");
}

function truncateMiddle(value, width) {
  const text = String(value ?? "-");
  if (text.length <= width) {
    return text.padEnd(width);
  }

  const left = Math.ceil((width - 3) / 2);
  const right = Math.floor((width - 3) / 2);
  return `${text.slice(0, left)}...${text.slice(text.length - right)}`;
}
