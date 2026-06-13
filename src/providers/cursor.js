import path from "node:path";
import fs from "node:fs/promises";
import { expandHomePath, encodeCursorProjectSlug } from "../lib/path-utils.js";
import { listFilesRecursive, pathExists } from "../lib/fs-walk.js";
import { readJsonl } from "../lib/jsonl.js";
import { parseDate } from "../lib/time.js";
import { compactPreview, extractTextFromContent } from "../lib/text.js";

const CURSOR_ROOT = expandHomePath("~/.cursor/projects");

export async function discoverCursorSessions(targetCwd) {
  const slug = encodeCursorProjectSlug(targetCwd);
  const transcriptRoot = path.join(CURSOR_ROOT, slug, "agent-transcripts");

  if (!(await pathExists(transcriptRoot))) {
    return [];
  }

  const files = await listFilesRecursive(transcriptRoot, (filePath) => filePath.endsWith(".jsonl"));
  const sessions = await Promise.all(files.map((filePath) => parseCursorSession(filePath, targetCwd)));

  return sessions.filter(Boolean);
}

export async function discoverAllCursorSessions() {
  if (!(await pathExists(CURSOR_ROOT))) {
    return [];
  }

  const projectEntries = await fs.readdir(CURSOR_ROOT, { withFileTypes: true });
  const sessions = [];

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const transcriptRoot = path.join(CURSOR_ROOT, entry.name, "agent-transcripts");
    if (!(await pathExists(transcriptRoot))) {
      continue;
    }

    const files = await listFilesRecursive(transcriptRoot, (filePath) => filePath.endsWith(".jsonl"));
    const parsed = await Promise.all(files.map((filePath) => parseCursorSession(filePath, undefined, entry.name)));
    sessions.push(...parsed.filter(Boolean));
  }

  return sessions;
}

async function parseCursorSession(filePath, targetCwd, projectSlug = undefined) {
  const records = await readJsonl(filePath);
  const fileStat = await fs.stat(filePath);
  const firstUserText = findFirstUserText(records);
  const sessionMeta = records.find((record) => record?.type === "session_meta");
  const id = sessionMeta?.payload?.id ?? path.basename(filePath, ".jsonl");

  return {
    agent: "cursor",
    id,
    startedAt: parseDate(sessionMeta?.payload?.timestamp ?? records[0]?.timestamp) ?? fileStat.birthtime,
    updatedAt: parseDate(records.at(-1)?.timestamp ?? sessionMeta?.payload?.timestamp) ?? fileStat.mtime,
    cwd: targetCwd ?? sessionMeta?.payload?.cwd,
    preview: firstUserText,
    transcriptPath: filePath,
    resumeCommand: ["agent", `--resume=${id}`],
    metadata: {
      source: "cursor",
      rawCwd: sessionMeta?.payload?.cwd,
      projectSlug,
    },
  };
}

function findFirstUserText(records) {
  for (const record of records) {
    const role = record?.payload?.role ?? record?.role;
    if (role !== "user") {
      continue;
    }

    const content = record?.payload?.content ?? record?.message?.content;
    const text = extractTextFromContent(content) ?? record?.text ?? record?.message?.text;
    const preview = compactPreview(text);
    if (preview) {
      return preview;
    }
  }

  return undefined;
}
