import path from "node:path";
import fs from "node:fs/promises";
import { expandHomePath, encodeClaudeProjectSlug } from "../lib/path-utils.js";
import { pathExists } from "../lib/fs-walk.js";
import { readJsonl } from "../lib/jsonl.js";
import { parseDate } from "../lib/time.js";
import { compactPreview, extractTextFromContent } from "../lib/text.js";

const CLAUDE_PROJECTS_ROOT = expandHomePath("~/.claude/projects");
const CLAUDE_HISTORY_PATH = expandHomePath("~/.claude/history.jsonl");

export async function discoverClaudeSessions(targetCwd) {
  const slug = encodeClaudeProjectSlug(targetCwd);
  const projectRoot = path.join(CLAUDE_PROJECTS_ROOT, slug);

  if (!(await pathExists(projectRoot))) {
    return [];
  }

  const dirEntries = await readProjectDir(projectRoot);
  const historyIndex = await readClaudeHistoryIndex();
  const sessions = await Promise.all(
    dirEntries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((filePath) => parseClaudeSession(filePath, targetCwd, historyIndex)),
  );

  return sessions.filter(Boolean);
}

export async function discoverAllClaudeSessions() {
  if (!(await pathExists(CLAUDE_PROJECTS_ROOT))) {
    return [];
  }

  const projectEntries = await fs.readdir(CLAUDE_PROJECTS_ROOT, { withFileTypes: true });
  const historyIndex = await readClaudeHistoryIndex();
  const sessions = [];

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectRoot = path.join(CLAUDE_PROJECTS_ROOT, entry.name);
    const files = (await readProjectDir(projectRoot)).filter((filePath) => filePath.endsWith(".jsonl"));
    const parsed = await Promise.all(files.map((filePath) => parseClaudeSession(filePath, undefined, historyIndex, entry.name)));
    sessions.push(...parsed.filter(Boolean));
  }

  return sessions;
}

async function readProjectDir(projectRoot) {
  const entries = await fs.readdir(projectRoot);
  return entries.map((entry) => path.join(projectRoot, entry));
}

async function parseClaudeSession(filePath, targetCwd, historyIndex, projectSlug = undefined) {
  const records = await readJsonl(filePath);
  const fileStat = await fs.stat(filePath);
  const firstRecord = records[0] ?? {};
  const sessionId = firstRecord.sessionId ?? firstRecord.session_id ?? path.basename(filePath, ".jsonl");
  const historyMatch = historyIndex.get(sessionId);
  const firstUserRecord = records.find((record) => record?.type === "user");
  const cwd = targetCwd ?? firstUserRecord?.cwd;

  return {
    agent: "claude",
    id: sessionId,
    startedAt: parseDate(firstRecord.timestamp ?? historyMatch?.timestamp) ?? fileStat.birthtime,
    updatedAt: parseDate(records.at(-1)?.timestamp ?? historyMatch?.timestamp) ?? fileStat.mtime,
    cwd,
    preview: historyMatch?.preview ?? findClaudePreview(records),
    transcriptPath: filePath,
    resumeCommand: ["claude", "--resume", sessionId],
    metadata: {
      source: "claude",
      projectSlug,
      model: firstUserRecord?.model,
      branch: firstUserRecord?.gitBranch,
      entrypoint: firstUserRecord?.entrypoint,
      version: firstUserRecord?.version,
    },
  };
}

async function readClaudeHistoryIndex() {
  if (!(await pathExists(CLAUDE_HISTORY_PATH))) {
    return new Map();
  }

  const records = await readJsonl(CLAUDE_HISTORY_PATH);
  const index = new Map();

  for (const record of records) {
    const sessionId = record?.sessionId ?? record?.session_id;
    if (!sessionId || index.has(sessionId)) {
      continue;
    }

    index.set(sessionId, {
      timestamp: record?.timestamp,
      preview: compactPreview(record?.prompt ?? record?.message ?? ""),
    });
  }

  return index;
}

function findClaudePreview(records) {
  for (const record of records) {
    if (record?.type !== "user") {
      continue;
    }

    const prompt = record?.prompt ?? extractTextFromContent(record?.message?.content) ?? record?.message;
    if (typeof prompt === "string" && prompt.trim()) {
      return compactPreview(prompt);
    }
  }

  return undefined;
}
