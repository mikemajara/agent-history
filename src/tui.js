import readline from "node:readline";
import { formatCompactDate, formatProject, shortenId } from "./format.js";
import { clampSelection, createBrowserState, getVisibleSessions, handleBrowserInput, setSearchIndex } from "./tui/state.js";
import { buildIndex } from "./lib/search.js";

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
  state.indexing = true;

  readline.emitKeypressEvents(io.stdin);
  io.stdin.setRawMode(true);
  io.stdin.resume();

  let onKeypress = undefined;
  let active = true;

  const cleanup = () => {
    active = false;
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
    const indexNote = state.indexing ? " (indexing…)" : "";
    lines.push(`search: ${state.search}${cursor} (${matchCount} match${matchCount === 1 ? "" : "es"}${indexNote})`);
    lines.push("");

    if (state.message) {
      lines.push(state.message);
      lines.push("");
    }

    const headerRows = lines.length;
    const hasSnippets = state.search && state.searchIndex;
    // Each session: 1 main row + (2 detail rows when search active)
    const baseRowsPerSession = hasSnippets ? 3 : 1;
    const availableRows = Math.max(height - headerRows - 1, 2);
    const maxSessions = Math.max(Math.floor(availableRows / baseRowsPerSession), 1);
    const queryTerms = state.search ? state.search.toLowerCase().split(/\s+/).filter(Boolean) : [];

    const start = Math.max(
      0,
      Math.min(state.selectedIndex - Math.floor(maxSessions / 2), visibleSessions.length - maxSessions),
    );
    const visibleWindow = visibleSessions.slice(start, start + maxSessions);

    for (let windowIndex = 0; windowIndex < visibleWindow.length; windowIndex++) {
      const session = visibleWindow[windowIndex];
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

      if (hasSnippets) {
        const snippet = state.snippetMap.get(session.id);
        const compactCwd = session.cwd ? session.cwd.replace(process.env.HOME ?? "", "~") : "-";

        // Row 2: snippet with term highlighting (truncate plain text first, then add ANSI)
        const snippetRaw = snippet ? `    ${snippet.role === "assistant" ? "AI" : "you"}: ${snippet.text}` : "    ";
        const snippetTruncated = truncateRight(snippetRaw, width);
        const snippetHighlighted = highlightTerms(snippetTruncated, queryTerms);
        lines.push(dim(snippetHighlighted));

        // Row 3: project directory
        lines.push(dim(truncateRight(`    ${compactCwd}`, width)));
      }
    }

    if (visibleSessions.length === 0) {
      lines.push("No matching sessions.");
    }

    const clippedLines = lines.slice(0, height - 1).map((line) => formatFrameLine(line, width));
    io.stdout.write(`\x1b[H${clippedLines.join("\n")}\x1b[J`);
  };

  render();

  // Build full-text index in background; re-render when done
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

function dim(text) {
  return `\x1b[2m${text}\x1b[0m`;
}

// Wraps each query term occurrence in bold, breaking out of dim for visibility.
function highlightTerms(text, queryTerms) {
  if (!queryTerms.length) return text;
  const lower = text.toLowerCase();
  const ranges = [];
  for (const term of queryTerms) {
    let pos = 0;
    while ((pos = lower.indexOf(term, pos)) !== -1) {
      ranges.push({ start: pos, end: pos + term.length });
      pos += term.length;
    }
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a.start - b.start);
  // Merge overlapping
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i].start <= last.end) {
      last.end = Math.max(last.end, ranges[i].end);
    } else {
      merged.push(ranges[i]);
    }
  }
  let result = "";
  let cursor = 0;
  for (const { start, end } of merged) {
    result += text.slice(cursor, start);
    // \x1b[0m resets dim, \x1b[1m applies bold, \x1b[0m\x1b[2m restores dim after
    result += `\x1b[0m\x1b[1m${text.slice(start, end)}\x1b[0m\x1b[2m`;
    cursor = end;
  }
  result += text.slice(cursor);
  return result;
}

function truncateRight(value, width) {
  const text = String(value ?? "");
  return text.length > width ? `${text.slice(0, Math.max(width - 3, 0))}...` : text;
}

function formatFrameLine(value, width) {
  const text = String(value ?? "");
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
  if (stripped.length > width) {
    return truncateRight(stripped, width).padEnd(width, " ");
  }
  return text + " ".repeat(Math.max(width - stripped.length, 0));
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
