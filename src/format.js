import path from "node:path";
import os from "node:os";
import { formatLocalDate } from "./lib/time.js";

export function formatSessionTable(sessions) {
  const rows = sessions.map((session) => ({
    agent: session.agent,
    updated: formatLocalDate(session.updatedAt ?? session.startedAt),
    id: shortenId(session.id),
    project: truncate(formatProject(session), 42),
    preview: truncate(session.preview ?? "-", 80),
  }));

  return formatTable(rows, ["agent", "updated", "id", "project", "preview"]);
}

export function formatSessionDetail(session) {
  const lines = [
    `agent: ${session.agent}`,
    `id: ${session.id}`,
    `updated: ${formatLocalDate(session.updatedAt ?? session.startedAt)}`,
    `cwd: ${session.cwd ?? "-"}`,
    `transcript: ${session.transcriptPath ?? "-"}`,
    `resume: ${session.resumeCommand?.join(" ") ?? "-"}`,
    `preview: ${session.preview ?? "-"}`,
  ];

  if (session.metadata) {
    for (const [key, value] of Object.entries(session.metadata)) {
      if (value == null) {
        continue;
      }

      lines.push(`${key}: ${String(value)}`);
    }
  }

  return lines.join("\n");
}

export function shortenId(id) {
  return id.length > 12 ? id.slice(0, 12) : id;
}

export function basenameOrDash(filePath) {
  return filePath ? path.basename(filePath) : "-";
}

export function formatProject(session) {
  return compactHomePath(session.cwd) ?? compactProjectSlug(session.metadata?.projectSlug) ?? "-";
}

function formatTable(rows, columns) {
  const widths = Object.fromEntries(
    columns.map((column) => [
      column,
      Math.max(column.length, ...rows.map((row) => String(row[column]).length)),
    ]),
  );

  const header = columns.map((column) => pad(String(column), widths[column])).join("  ");
  const divider = columns.map((column) => "-".repeat(widths[column])).join("  ");
  const body = rows.map((row) => columns.map((column) => pad(String(row[column]), widths[column])).join("  "));

  return [header, divider, ...body].join("\n");
}

function pad(value, width) {
  return value.padEnd(width, " ");
}

function truncate(value, width) {
  return value.length > width ? `${value.slice(0, width - 3)}...` : value;
}

function compactHomePath(value) {
  if (!value) {
    return undefined;
  }

  const home = os.homedir();
  return value === home || value.startsWith(`${home}${path.sep}`) ? `~${value.slice(home.length)}` : value;
}

function compactProjectSlug(value) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const homeSlug = os.homedir().replace(path.parse(os.homedir()).root, "").split(path.sep).join("-");
  const claudeHomeSlug = `-${homeSlug}`;
  const slug = value.startsWith(claudeHomeSlug) ? value.slice(1) : value;

  if (!slug.startsWith(`${homeSlug}-`)) {
    return value;
  }

  return `~/${slug.slice(homeSlug.length + 1).split("-").join("/")}`;
}
