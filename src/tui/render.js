import { formatProject, formatResumeCommand } from "../format.js";
import { formatMarkdownLines } from "../lib/markdown.js";
import { freeTextTerms } from "../lib/query.js";
import { clampSelection, getVisibleSessions } from "./state.js";

/** Terminals at or above this width use a side preview; narrower ones stack it. */
export const PREVIEW_SIDE_MIN_WIDTH = 116;

export const SEARCH_PLACEHOLDER = "Search titles, messages, paths · dir: · date:";

const PROMPT_WORD_LIMIT = 6;
const AGE_WIDTH = 9;
const AGENT_WIDTH = 7;
const TURNS_WIDTH = 5;

/** Stable short labels + ANSI colors for known agents. */
export const AGENT_BADGES = {
  cursor: { label: "cursor", color: "90" }, // gray
  claude: { label: "claude", color: "38;5;208" }, // orange
  codex: { label: "codex", color: "34" }, // blue (ChatGPT)
  opencode: { label: "open", color: "35" }, // purple
  fx: { label: "fx", color: "30" }, // black
};

export function renderBrowserFrame(state, width, height) {
  const visibleSessions = getVisibleSessions(state);
  clampSelection(state, visibleSessions);
  const narrow = width < 100;
  const footerRows = 3;
  const controls = renderControls(state);
  const headerLines = [
    "Resume a previous session",
    "",
    renderSearchField(state, width),
    truncateRight(controls, width),
    "",
  ];

  const selectedSession = visibleSessions[state.selectedIndex];
  const previewOn = state.previewPane !== false;
  const sidePreview = previewOn && width >= PREVIEW_SIDE_MIN_WIDTH;
  const bodyBudget = Math.max(height - footerRows - headerLines.length, 1);

  let listWidth = width;
  let previewWidth = 0;
  let listBudget = bodyBudget;
  let previewBudget = 0;

  if (previewOn && sidePreview) {
    listWidth = Math.max(40, Math.floor(width * 0.62));
    previewWidth = Math.max(20, width - listWidth - 1);
    listBudget = bodyBudget;
    previewBudget = bodyBudget;
  } else if (previewOn) {
    // Prefer enough stacked preview room for metadata + several conversation
    // turns, while keeping a column header and at least one session row.
    const desiredPreview = Math.min(18, Math.max(10, Math.floor(bodyBudget * 0.65)));
    listBudget = Math.max(2, bodyBudget - desiredPreview - 1);
    previewBudget = Math.max(1, bodyBudget - listBudget - 1);
    previewWidth = width;
  }

  const layout = listColumnLayout(listWidth);
  const columnHeader = formatFrameLine(renderColumnHeader(layout), listWidth);
  const rowBudget = Math.max(1, listBudget - 1);
  const start = Math.max(
    0,
    Math.min(state.selectedIndex - Math.floor(rowBudget / 2), visibleSessions.length - rowBudget),
  );
  const visibleWindow = visibleSessions.slice(start, start + rowBudget);
  const listLines = [columnHeader];

  for (let windowIndex = 0; windowIndex < visibleWindow.length; windowIndex++) {
    const session = visibleWindow[windowIndex];
    const index = start + windowIndex;
    const selected = index === state.selectedIndex;
    const row = renderSessionRow(session, state, layout, selected);
    const styled = styleSessionRow(row, { selected, zebra: index % 2 === 0 });
    listLines.push(formatFrameLine(styled, listWidth));
  }

  if (visibleSessions.length === 0) {
    listLines.push(formatFrameLine("No matching sessions.", listWidth));
  }

  while (listLines.length < listBudget) {
    listLines.push(formatFrameLine("", listWidth));
  }

  const bodyLines = [];
  if (previewOn && selectedSession) {
    const detailLines = renderReferenceDetails(selectedSession, state, previewWidth, previewBudget);
    while (detailLines.length < previewBudget) {
      detailLines.push(formatFrameLine("", previewWidth));
    }

    if (sidePreview) {
      for (let i = 0; i < listBudget; i++) {
        const left = listLines[i] ?? formatFrameLine("", listWidth);
        const right = detailLines[i] ?? formatFrameLine("", previewWidth);
        bodyLines.push(`${left}│${right}`);
      }
    } else {
      bodyLines.push(...listLines.slice(0, listBudget));
      bodyLines.push(formatFrameLine("─".repeat(width), width));
      bodyLines.push(...detailLines.slice(0, previewBudget));
    }
  } else if (previewOn) {
    const emptyPreview = Array.from({ length: previewBudget }, () => formatFrameLine("", previewWidth));
    if (sidePreview) {
      for (let i = 0; i < listBudget; i++) {
        bodyLines.push(`${listLines[i] ?? formatFrameLine("", listWidth)}│${emptyPreview[i] ?? formatFrameLine("", previewWidth)}`);
      }
    } else {
      bodyLines.push(...listLines.slice(0, listBudget));
      bodyLines.push(formatFrameLine("─".repeat(width), width));
      bodyLines.push(...emptyPreview);
    }
  } else {
    bodyLines.push(...listLines.slice(0, listBudget));
  }

  const status = `${visibleSessions.length === 0 ? 0 : state.selectedIndex + 1} / ${visibleSessions.length} · ${scrollPercent(state.selectedIndex, visibleSessions.length)}%`;
  const previewHint = state.noPreview ? "no-preview on" : `${keycap("ctrl+p")} preview`;
  const footer = [
    "─".repeat(width),
    renderFooterActions(narrow),
    alignFooter(`${previewHint}  ${keycap("↑/↓")} browse`, status, width),
  ];

  return [...headerLines, ...bodyLines, ...footer]
    .slice(0, height)
    .map((line) => formatFrameLine(line, width))
    .join("\n");
}

/**
 * @param {boolean} narrow
 * @returns {string}
 */
export function renderFooterActions(narrow) {
  const enter = `${keycap("enter", { primary: true })} resume`;
  if (narrow) {
    return [
      enter,
      `${keycap("ctrl+n")} new`,
      `${keycap("esc")} exit`,
      `${keycap("tab")} focus`,
    ].join("  ");
  }

  return [
    enter,
    `${keycap("ctrl+n")} new`,
    `${keycap("esc")} exit`,
    `${keycap("ctrl+c")} exit`,
    `${keycap("tab")} focus`,
    `${keycap("←/→")} option`,
  ].join("  ");
}

/**
 * @param {string} label
 * @param {{ primary?: boolean }} [options]
 * @returns {string}
 */
export function keycap(label, options = {}) {
  const body = `[${label}]`;
  if (process.env.NO_COLOR) {
    return body;
  }
  return options.primary ? inverse(body) : dim(body);
}

/**
 * Broader → specific: Age · Agent · Directory · Prompt · Turns
 *
 * @param {number} width
 * @returns {{
 *   age: number,
 *   agent: number,
 *   prompt: number,
 *   turns: number,
 *   directory: number,
 *   showDirectory: boolean,
 *   columns: { age: number, agent: number, prompt: number, turns: number, directory: number }
 * }}
 */
export function listColumnLayout(width) {
  const showDirectory = width >= 80;
  // marker(1) + sp + age + sp + agent + sp = 20; trailing turns (+ leading sp) = 6
  const prefixWidth = 1 + 1 + AGE_WIDTH + 1 + AGENT_WIDTH + 1;
  const turnsTail = 1 + TURNS_WIDTH;
  const flex = Math.max(8, width - prefixWidth - turnsTail);

  let directoryWidth = 0;
  let promptWidth = flex;
  if (showDirectory) {
    // Directory and prompt share the flex band roughly evenly; directory is as
    // important as the prompt snippet for scanning.
    directoryWidth = Math.max(16, Math.floor(flex * 0.5));
    promptWidth = Math.max(8, flex - 1 - directoryWidth);
  }

  const directoryStart = prefixWidth;
  const promptStart = showDirectory ? directoryStart + directoryWidth + 1 : prefixWidth;
  const turnsStart = promptStart + promptWidth + 1;
  const columns = {
    age: 2,
    agent: 2 + AGE_WIDTH + 1,
    directory: showDirectory ? directoryStart : -1,
    prompt: promptStart,
    turns: turnsStart,
  };

  return {
    age: AGE_WIDTH,
    agent: AGENT_WIDTH,
    prompt: promptWidth,
    turns: TURNS_WIDTH,
    directory: directoryWidth,
    showDirectory,
    columns,
  };
}

function renderColumnHeader(layout) {
  const parts = [
    " ",
    "AGE".padEnd(layout.age, " "),
    "AGENT".padEnd(layout.agent, " "),
  ];
  if (layout.showDirectory) {
    parts.push("DIRECTORY".padEnd(layout.directory, " ").slice(0, layout.directory));
  }
  parts.push("PROMPT".padEnd(layout.prompt, " "));
  parts.push("TURNS".padStart(layout.turns, " "));
  return dim(parts.join(" "));
}

function renderSessionRow(session, state, layout, selected) {
  const marker = selected ? "›" : " ";
  const timestamp = state.sort === "created" ? session.startedAt ?? session.updatedAt : session.updatedAt ?? session.startedAt;
  const age = formatRelativeAge(timestamp, state.now ?? new Date()).padEnd(layout.age, " ");
  // Selected rows use plain badge text so inverse styling stays readable.
  const agent = formatAgentBadge(session.agent, { width: layout.agent, color: !selected });
  const promptText = state.noPreview ? "-" : promptSnippet(session.preview);
  const prompt = truncateRight(promptText, layout.prompt).padEnd(layout.prompt, " ");
  const turns = formatTurnCount(countUserTurns(state, session)).padStart(layout.turns, " ");
  const parts = [marker, age, agent];
  if (layout.showDirectory) {
    parts.push(truncateLeft(formatProject(session), layout.directory).padEnd(layout.directory, " "));
  }
  parts.push(prompt, turns);
  return parts.join(" ");
}

/**
 * @param {string | undefined} agent
 * @param {{ width?: number, color?: boolean }} [options]
 */
export function formatAgentBadge(agent, options = {}) {
  const width = options.width ?? AGENT_WIDTH;
  const colorizeBadge = options.color !== false;
  const known = AGENT_BADGES[agent];
  const label = (known?.label ?? String(agent ?? "-")).padEnd(width, " ").slice(0, width);
  if (!colorizeBadge || process.env.NO_COLOR || !known) {
    return label;
  }
  return colorize(known.color, label);
}

function styleSessionRow(row, { selected, zebra }) {
  if (selected) {
    return inverse(row);
  }
  // Avoid wrapping colored badges in dim/inverse resets; zebra only when colorless.
  if (zebra && process.env.NO_COLOR) {
    return dim(row);
  }
  return row;
}

function renderControls(state) {
  const filterOptions = state.scope === "cwd" ? "[Cwd] All" : "Cwd [All]";
  const sortOptions = state.sort === "created" ? "Updated [Created]" : "[Updated] Created";
  const filter = `Filter: ${filterOptions}`;
  const sort = `Sort: ${sortOptions}`;
  const filterPart = state.focusedControl === "filter" ? inverse(filter) : filter;
  const sortPart = state.focusedControl === "sort" ? inverse(sort) : sort;
  return `${filterPart}   ${sortPart}`;
}

/**
 * Dedicated search field with `/` prompt, teaching placeholder, and end cursor.
 * Long queries left-truncate so the editable end (and cursor) stay visible.
 *
 * @param {{ search?: string }} state
 * @param {number} width
 */
export function renderSearchField(state, width) {
  const open = "┌ ";
  const close = " ┐";
  const prompt = "/ ";
  const cursor = inverse(" ");
  const frameChrome = open.length + prompt.length + close.length;
  const contentWidth = Math.max(width - frameChrome, 2);
  const query = String(state.search ?? "");
  const textWidth = Math.max(contentWidth - 1, 1); // reserve one cell for the cursor

  let content;
  if (query) {
    const visibleQuery = query.length > textWidth
      ? `...${query.slice(-(Math.max(textWidth - 3, 1)))}`
      : query;
    const pad = Math.max(textWidth - visibleQuery.length, 0);
    content = `${visibleQuery}${cursor}${"─".repeat(pad)}`;
  } else {
    const placeholder = truncateRight(SEARCH_PLACEHOLDER, textWidth);
    const pad = Math.max(textWidth - visibleLength(placeholder), 0);
    content = `${cursor}${dim(placeholder)}${"─".repeat(pad)}`;
  }

  return padVisible(`${open}${prompt}${content}${close}`, width);
}

function visibleLength(text) {
  return String(text ?? "").replace(/\x1b\[[0-9;]*m/g, "").length;
}

function padVisible(text, width) {
  const length = visibleLength(text);
  if (length > width) {
    return truncateRight(String(text).replace(/\x1b\[[0-9;]*m/g, ""), width);
  }
  return `${text}${" ".repeat(width - length)}`;
}

function renderReferenceDetails(session, state, width, budget = Infinity) {
  const metadata = session.metadata ?? {};
  const lines = [];
  const addField = (label, value) => {
    if (value == null || value === "") return;
    lines.push(formatFrameLine(
      ` ${label.padEnd(12, " ")} ${truncateRight(String(value), Math.max(width - 15, 1))}`,
      width,
    ));
  };

  addField("Session:", session.id);
  lines.push(formatFrameLine(
    ` ${"Provider:".padEnd(12, " ")} ${formatAgentBadge(session.agent)}`,
    width,
  ));
  addField("Model:", metadata.model);
  addField("Created:", formatDetailTimestamp(session.startedAt));
  addField("Updated:", formatDetailTimestamp(session.updatedAt));
  addField("Directory:", formatProject(session));
  addField("Branch:", metadata.branch);
  addField("Turns:", formatTurnCount(countUserTurns(state, session)));
  addField("Resume:", formatResumeCommand(session));

  if (state.noPreview) {
    return lines.slice(0, Number.isFinite(budget) ? budget : undefined);
  }

  if (Number.isFinite(budget) && lines.length >= budget) {
    return clipReferenceDetails(lines, budget, width);
  }

  lines.push(formatFrameLine(" Conversation:", width));

  const turns = state.searchIndex?.docs?.[state.sessions.indexOf(session)]?.turns ?? [];
  const terms = freeTextTerms(state.search, state.now ?? new Date());
  const excerpt = buildConversationExcerpt(turns, session, terms);

  let truncated = false;
  for (const turn of excerpt) {
    const role = turn.role === "assistant" ? "ai:  " : "you: ";
    const mdLines = formatMarkdownLines(turn.text);
    for (let lineIndex = 0; lineIndex < mdLines.length; lineIndex++) {
      const prefix = lineIndex === 0 ? role : " ".repeat(role.length);
      const wrapped = wrapReferenceText(`${prefix}${mdLines[lineIndex]}`, Math.max(width - 2, 1));
      for (const line of wrapped) {
        if (Number.isFinite(budget) && lines.length >= budget) {
          truncated = true;
          break;
        }
        const highlighted = highlightMatches(line, terms);
        lines.push(formatFrameLine(` ${highlighted}`, width));
      }
      if (truncated) break;
    }
    if (truncated) break;
  }

  if (truncated && lines.length > 0) {
    lines[lines.length - 1] = formatFrameLine(` ${truncateRight("...", Math.max(width - 2, 1))}`, width);
  }

  return lines;
}

/**
 * Default excerpt starts at the first user turn. With free-text terms, jump to
 * the earliest matching turn (one prior turn of context when available).
 *
 * @param {{ role: string, text: string }[]} turns
 * @param {{ preview?: string }} session
 * @param {string[]} terms
 */
export function buildConversationExcerpt(turns, session, terms = []) {
  const userIndex = turns.findIndex((turn) => turn.role === "user");
  let excerpt = userIndex >= 0
    ? turns.slice(userIndex)
    : turns.filter((turn) => turn.role === "user" || turn.role === "assistant");
  if (excerpt.length === 0 && session.preview) {
    excerpt = [{ role: "user", text: session.preview }];
  }

  if (!terms.length || excerpt.length === 0) {
    return excerpt;
  }

  const matchIndex = excerpt.findIndex((turn) => terms.some((term) => turn.text.toLowerCase().includes(term)));
  if (matchIndex < 0) {
    return excerpt;
  }

  const start = Math.max(0, matchIndex - 1);
  return excerpt.slice(start);
}

/**
 * Highlight free-text match terms. Honors NO_COLOR.
 *
 * @param {string} text
 * @param {string[]} terms
 */
export function highlightMatches(text, terms) {
  if (!terms?.length || process.env.NO_COLOR) {
    return text;
  }

  const unique = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) {
    return text;
  }

  const pattern = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "gi");
  return String(text ?? "").replace(pattern, (match) => highlight(match));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clipReferenceDetails(lines, budget, width) {
  if (lines.length <= budget) return lines;
  if (budget <= 0) return [];
  const clipped = lines.slice(0, budget);
  clipped[budget - 1] = formatFrameLine(` ${truncateRight("...", Math.max(width - 2, 1))}`, width);
  return clipped;
}

function wrapReferenceText(value, width) {
  const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (visibleLength(next) <= width) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function promptSnippet(preview, maxWords = PROMPT_WORD_LIMIT) {
  const normalized = String(preview ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  return normalized.split(" ").filter(Boolean).slice(0, maxWords).join(" ");
}

export function countUserTurns(state, session) {
  if (!state.searchIndex?.docs) return undefined;
  const index = state.sessions.indexOf(session);
  if (index < 0) return undefined;
  const turns = state.searchIndex.docs[index]?.turns;
  if (!Array.isArray(turns)) return undefined;
  return turns.filter((turn) => turn.role === "user").length;
}

function formatTurnCount(count) {
  if (count == null) return "-";
  return String(count);
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
  const leftWidth = visibleLength(left);
  const rightWidth = visibleLength(right);
  const gap = Math.max(width - leftWidth - rightWidth, 1);
  return `${left}${" ".repeat(gap)}${right}`;
}

function inverse(text) {
  return colorize("7", text);
}

function dim(text) {
  return colorize("2", text);
}

function highlight(text) {
  // Bold yellow — readable on dark and light terminals without reverse video.
  return colorize("1;33", text);
}

function colorize(code, text) {
  return process.env.NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;
}

function truncateRight(value, width) {
  const text = String(value ?? "");
  return text.length > width ? `${text.slice(0, Math.max(width - 3, 0))}...` : text;
}

function truncateLeft(value, width) {
  const text = String(value ?? "");
  if (text.length <= width) {
    return text;
  }
  if (width <= 3) {
    return text.slice(-width);
  }
  return `...${text.slice(-(width - 3))}`;
}

function formatFrameLine(value, width) {
  const text = String(value ?? "");
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
  if (stripped.length > width) {
    return truncateRight(stripped, width).padEnd(width, " ");
  }
  return text + " ".repeat(Math.max(width - stripped.length, 0));
}
