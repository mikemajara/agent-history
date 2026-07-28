import { formatResumeCommand } from "../format.js";
import { clampSelection, getVisibleSessions } from "./state.js";

export function renderBrowserFrame(state, width, height) {
  const visibleSessions = getVisibleSessions(state);
  clampSelection(state, visibleSessions);
  const narrow = width < 100;
  const footerRows = 3;
  const searchText = state.search || "Type to search";
  const controls = renderControls(state);
  const headerLines = [
    "Resume a previous session",
    "",
    narrow ? truncateRight(searchText, width) : alignSearchAndControls(searchText, controls, width),
  ];

  if (narrow) {
    headerLines.push(truncateRight(controls, width));
  }
  headerLines.push("");

  const selectedSession = visibleSessions[state.selectedIndex];
  const fullDetailLines = state.expanded && selectedSession
    ? renderReferenceDetails(selectedSession, state, width)
    : [];
  const detailBudget = Math.max(height - footerRows - headerLines.length - 1, 0);
  const detailLines = clipReferenceDetails(fullDetailLines, detailBudget, width);
  const listBudget = Math.max(height - footerRows - headerLines.length - detailLines.length, 1);
  const start = Math.max(
    0,
    Math.min(state.selectedIndex - Math.floor(listBudget / 2), visibleSessions.length - listBudget),
  );
  const visibleWindow = visibleSessions.slice(start, start + listBudget);
  const listLines = [];

  for (let windowIndex = 0; windowIndex < visibleWindow.length; windowIndex++) {
    const session = visibleWindow[windowIndex];
    const index = start + windowIndex;
    const selected = index === state.selectedIndex;
    const marker = selected ? (state.expanded ? "⌄" : "›") : " ";
    const timestamp = state.sort === "created" ? session.startedAt ?? session.updatedAt : session.updatedAt ?? session.startedAt;
    const age = formatRelativeAge(timestamp, state.now ?? new Date());
    const provider = String(session.agent ?? "-").padEnd(7, " ");
    const row = `${marker} ${age.padEnd(9, " ")} ${provider} ${truncateRight(normalizePreview(session.preview), Math.max(width - 21, 1))}`;
    const styled = selected ? inverse(row) : index % 2 === 0 ? dim(row) : row;
    listLines.push(styled);

    if (selected && detailLines.length > 0) {
      listLines.push(...detailLines);
    }
  }

  if (visibleSessions.length === 0) {
    listLines.push("No matching sessions.");
  }

  const status = `${visibleSessions.length === 0 ? 0 : state.selectedIndex + 1} / ${visibleSessions.length} · ${scrollPercent(state.selectedIndex, visibleSessions.length)}%`;
  const footer = [
    "─".repeat(width),
    narrow
      ? "enter resume   esc exit   tab focus   ←/→ option"
      : "enter resume   esc exit   ctrl+c exit   tab focus filter/sort   ←/→ change option",
    alignFooter("ctrl+e expand   ↑/↓ browse", status, width),
  ];

  return [...headerLines, ...listLines, ...footer]
    .slice(0, height)
    .map((line) => formatFrameLine(line, width))
    .join("\n");
}

function renderControls(state) {
  const filter = state.scope === "cwd" ? "[Cwd] All" : "Cwd [All]";
  const sort = state.sort === "created" ? "Updated [Created]" : "[Updated] Created";
  return `Filter: ${filter}   Sort: ${sort}`;
}

function alignSearchAndControls(searchText, controls, width) {
  const left = truncateRight(searchText, Math.max(width - controls.length - 1, 1));
  return `${left}${" ".repeat(Math.max(width - left.length - controls.length, 1))}${controls}`;
}

function renderReferenceDetails(session, state, width) {
  const metadata = session.metadata ?? {};
  const lines = [];
  const addField = (label, value) => {
    if (value == null || value === "") return;
    lines.push(`  │ ${label.padEnd(12, " ")} ${truncateRight(String(value), Math.max(width - 17, 1))}`);
  };

  addField("Session:", session.id);
  addField("Provider:", session.agent);
  addField("Model:", metadata.model);
  addField("Created:", formatDetailTimestamp(session.startedAt));
  addField("Updated:", formatDetailTimestamp(session.updatedAt));
  addField("Directory:", session.cwd ?? metadata.projectSlug ?? "-");
  addField("Branch:", metadata.branch);
  addField("Resume:", formatResumeCommand(session));
  lines.push("  │ Conversation:");

  const turns = state.searchIndex?.docs?.[state.sessions.indexOf(session)]?.turns ?? [];
  const userIndex = turns.findIndex((turn) => turn.role === "user");
  const excerpt = userIndex >= 0 ? turns.slice(userIndex, userIndex + 2) : [];
  if (excerpt.length === 0 && session.preview) {
    excerpt.push({ role: "user", text: session.preview });
  }

  for (const turn of excerpt) {
    const role = turn.role === "assistant" ? "ai:  " : "you: ";
    for (const line of wrapReferenceText(`${role}${turn.text}`, Math.max(width - 7, 1))) {
      lines.push(`  │ ${line}`);
    }
  }

  return lines;
}

function clipReferenceDetails(lines, budget, width) {
  if (lines.length <= budget) return lines;
  if (budget <= 0) return [];
  const clipped = lines.slice(0, budget);
  clipped[budget - 1] = `  │ ${truncateRight("...", Math.max(width - 4, 1))}`;
  return clipped;
}

function wrapReferenceText(value, width) {
  const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (line.length + word.length + 1 <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function normalizePreview(preview) {
  return String(preview ?? "-").replace(/\s+/g, " ").trim() || "-";
}

function formatRelativeAge(value, now) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "-";
  const elapsed = Math.max(0, now.getTime() - value.getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDetailTimestamp(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "-";
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function scrollPercent(index, count) {
  if (count <= 1) return count === 1 ? 100 : 0;
  return Math.round((index / (count - 1)) * 100);
}

function alignFooter(left, right, width) {
  const gap = Math.max(width - left.length - right.length, 1);
  return `${left}${" ".repeat(gap)}${right}`;
}

function inverse(text) {
  return colorize("7", text);
}

function dim(text) {
  return colorize("2", text);
}

function colorize(code, text) {
  return process.env.NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;
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
