import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expandHomePath } from "./path-utils.js";
import { listFilesRecursive, pathExists } from "./fs-walk.js";

export const CACHE_VERSION = 1;
export const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", "agent-history");

const CURSOR_ROOT = expandHomePath("~/.cursor/projects");
const CLAUDE_PROJECTS_ROOT = expandHomePath("~/.claude/projects");
const CLAUDE_HISTORY_PATH = expandHomePath("~/.claude/history.jsonl");
const CODEX_SESSIONS_ROOT = expandHomePath("~/.codex/sessions");
const OPENCODE_DB_PATH = process.env.OPENCODE_DATABASE_PATH
  ?? expandHomePath("~/.local/share/opencode/opencode.db");

/**
 * @param {{ cacheDir?: string }} [options]
 */
export function getCachePath(options = {}) {
  const dir = options.cacheDir ?? process.env.AGENT_HISTORY_CACHE_DIR ?? DEFAULT_CACHE_DIR;
  return path.join(dir, "sessions-v1.json");
}

/**
 * Collect a cheap fingerprint of provider source files (path + mtime + size).
 * Listing/stat only — does not parse transcript bodies.
 *
 * @param {{
 *   cursorRoot?: string,
 *   claudeProjectsRoot?: string,
 *   claudeHistoryPath?: string,
 *   codexSessionsRoot?: string,
 *   opencodeDbPath?: string,
 * }} [roots]
 */
export async function collectSourceFingerprint(roots = {}) {
  const files = [];
  const cursorRoot = roots.cursorRoot ?? CURSOR_ROOT;
  const claudeProjectsRoot = roots.claudeProjectsRoot ?? CLAUDE_PROJECTS_ROOT;
  const claudeHistoryPath = roots.claudeHistoryPath ?? CLAUDE_HISTORY_PATH;
  const codexSessionsRoot = roots.codexSessionsRoot ?? CODEX_SESSIONS_ROOT;
  const opencodeDbPath = roots.opencodeDbPath ?? OPENCODE_DB_PATH;

  await collectJsonlUnder(cursorRoot, files, (filePath) => filePath.includes(`${path.sep}agent-transcripts${path.sep}`));
  await collectJsonlUnder(claudeProjectsRoot, files);
  await collectFile(claudeHistoryPath, files);
  await collectJsonlUnder(codexSessionsRoot, files);
  await collectFile(opencodeDbPath, files);

  files.sort((left, right) => left.path.localeCompare(right.path));
  const signature = crypto
    .createHash("sha256")
    .update(files.map((file) => `${file.path}\0${file.mtimeMs}\0${file.size}`).join("\n"))
    .digest("hex");

  return { signature, files };
}

/**
 * @param {string} cachePath
 * @param {{ signature: string }} fingerprint
 */
export async function readSessionCache(cachePath, fingerprint) {
  let raw;
  try {
    raw = await fs.readFile(cachePath, "utf8");
  } catch {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (payload?.version !== CACHE_VERSION) return null;
  if (payload?.fingerprint !== fingerprint.signature) return null;
  if (!Array.isArray(payload.sessions)) return null;

  return reviveSessions(payload.sessions);
}

/**
 * @param {string} cachePath
 * @param {import("../types.js").AgentSession[]} sessions
 * @param {{ signature: string }} fingerprint
 */
export async function writeSessionCache(cachePath, sessions, fingerprint) {
  const dir = path.dirname(cachePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = {
    version: CACHE_VERSION,
    fingerprint: fingerprint.signature,
    updatedAt: new Date().toISOString(),
    sessions: serializeSessions(sessions),
  };
  await fs.writeFile(tempPath, `${JSON.stringify(payload)}\n`, "utf8");
  await fs.rename(tempPath, cachePath);
}

/**
 * Remove the session cache file if present.
 * @param {string} cachePath
 */
export async function clearSessionCache(cachePath) {
  try {
    await fs.unlink(cachePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function serializeSessions(sessions) {
  return sessions.map((session) => ({
    ...session,
    startedAt: session.startedAt instanceof Date ? session.startedAt.toISOString() : session.startedAt ?? null,
    updatedAt: session.updatedAt instanceof Date ? session.updatedAt.toISOString() : session.updatedAt ?? null,
  }));
}

export function reviveSessions(sessions) {
  return sessions.map((session) => ({
    ...session,
    startedAt: reviveDate(session.startedAt),
    updatedAt: reviveDate(session.updatedAt),
  }));
}

function reviveDate(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function collectJsonlUnder(root, files, filter) {
  if (!(await pathExists(root))) return;
  const paths = await listFilesRecursive(root, (filePath) => {
    if (!filePath.endsWith(".jsonl")) return false;
    return filter ? filter(filePath) : true;
  });
  await Promise.all(paths.map((filePath) => collectFile(filePath, files)));
}

async function collectFile(filePath, files) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return;
    files.push({
      path: filePath,
      mtimeMs: Math.trunc(stat.mtimeMs),
      size: stat.size,
    });
  } catch {
    // Missing optional roots/files are fine.
  }
}
