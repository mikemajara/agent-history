import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expandHomePath } from "./path-utils.js";

export const ANNOTATIONS_VERSION = 1;
export const DEFAULT_DATA_DIR = path.join(os.homedir(), ".local", "share", "agent-history");
export const DEFAULT_STATUSES = ["pending", "parked"];
export const STATUSES = DEFAULT_STATUSES;

/**
 * @param {{ dataDir?: string }} [options]
 */
export function getDataDir(options = {}) {
  return options.dataDir ?? process.env.AGENT_HISTORY_DATA_DIR ?? DEFAULT_DATA_DIR;
}

/**
 * @param {{ dataDir?: string }} [options]
 */
export function getAnnotationsPath(options = {}) {
  return path.join(getDataDir(options), "annotations-v1.json");
}

/**
 * @param {{ configPath?: string }} [options]
 */
export function getConfigPath(options = {}) {
  if (options.configPath) return expandHomePath(options.configPath);
  if (process.env.AGENT_HISTORY_CONFIG) return expandHomePath(process.env.AGENT_HISTORY_CONFIG);
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "agent-history", "config.json");
}

/**
 * @param {{ agent?: string, id?: string }} session
 */
export function annotationKey(session) {
  return `${session.agent}:${session.id}`;
}

/**
 * @param {{ configPath?: string, statuses?: string[] }} [options]
 * @returns {string[]}
 */
export function getStatuses(options = {}) {
  if (Array.isArray(options.statuses)) {
    return normalizeStatusList(options.statuses) ?? DEFAULT_STATUSES;
  }
  return readStatusesFromFile(getConfigPath(options)) ?? DEFAULT_STATUSES;
}

/**
 * @param {string | undefined} status
 * @param {string[]} [statuses]
 */
export function nextStatus(status, statuses = DEFAULT_STATUSES) {
  const list = statuses.length ? statuses : DEFAULT_STATUSES;
  const index = list.indexOf(status);
  if (index === -1) return list[0];
  if (index >= list.length - 1) return undefined;
  return list[index + 1];
}

/**
 * Pin group, then unpinned first status, then the rest.
 * @param {{ pinned?: boolean, status?: string }} session
 * @param {string[]} [statuses]
 */
export function annotationRank(session, statuses = DEFAULT_STATUSES) {
  if (session.pinned) return 0;
  if (statuses[0] && session.status === statuses[0]) return 1;
  return 2;
}

/**
 * @param {import("../types.js").AgentSession[]} sessions
 * @param {Record<string, { pinned?: boolean, status?: string }>} annotations
 * @param {string[]} [statuses]
 */
export function applyAnnotations(sessions, annotations, statuses = DEFAULT_STATUSES) {
  const map = annotations && typeof annotations === "object" ? annotations : {};
  return sessions.map((session) => {
    const entry = map[annotationKey(session)];
    if (!entry || typeof entry !== "object") {
      return { ...session, pinned: false, status: undefined };
    }
    return {
      ...session,
      pinned: entry.pinned === true,
      status: normalizeStatus(entry.status, statuses),
    };
  });
}

/**
 * @param {{ dataDir?: string, statuses?: string[], configPath?: string }} [options]
 * @returns {Promise<Record<string, { pinned?: boolean, status?: string, updatedAt?: string }>>}
 */
export async function readAnnotations(options = {}) {
  const statuses = resolveStatuses(options);
  const filePath = getAnnotationsPath(options);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    return {};
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const records = payload.annotations && typeof payload.annotations === "object" && !Array.isArray(payload.annotations)
    ? payload.annotations
    : payload.version == null && payload.annotations == null
      ? payload
      : {};

  const annotations = {};
  for (const [key, value] of Object.entries(records)) {
    if (!key.includes(":") || !value || typeof value !== "object") continue;
    const pinned = value.pinned === true;
    const status = normalizeStatus(value.status, statuses);
    if (!pinned && !status) continue;
    annotations[key] = {
      ...(pinned ? { pinned: true } : {}),
      ...(status ? { status } : {}),
      ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
    };
  }
  return annotations;
}

/**
 * @param {import("../types.js").AgentSession} session
 * @param {{ pinned?: boolean, status?: string | null }} patch
 * @param {{ dataDir?: string, statuses?: string[], configPath?: string }} [options]
 */
export async function upsertAnnotation(session, patch, options = {}) {
  const statuses = resolveStatuses(options);
  const annotations = await readAnnotations(options);
  const key = annotationKey(session);
  const current = annotations[key] ?? {};
  const pinned = patch.pinned === undefined ? current.pinned === true : patch.pinned === true;
  const status = patch.status === undefined ? current.status : patch.status;
  const normalized = normalizeStatus(status, statuses);

  if (!pinned && !normalized) {
    delete annotations[key];
  } else {
    annotations[key] = {
      ...(pinned ? { pinned: true } : {}),
      ...(normalized ? { status: normalized } : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  await writeAnnotations(annotations, options);
  return annotations[key] ?? {};
}

/**
 * @param {Record<string, unknown>} annotations
 * @param {{ dataDir?: string }} [options]
 */
export async function writeAnnotations(annotations, options = {}) {
  const filePath = getAnnotationsPath(options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = {
    version: ANNOTATIONS_VERSION,
    updatedAt: new Date().toISOString(),
    annotations,
  };
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function resolveStatuses(options = {}) {
  if (Array.isArray(options.statuses)) {
    return normalizeStatusList(options.statuses) ?? DEFAULT_STATUSES;
  }
  if (options.configPath || process.env.AGENT_HISTORY_CONFIG) {
    return getStatuses(options);
  }
  return DEFAULT_STATUSES;
}

function readStatusesFromFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    return undefined;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (Array.isArray(payload)) {
    return normalizeStatusList(payload);
  }
  if (payload && typeof payload === "object" && Array.isArray(payload.statuses)) {
    return normalizeStatusList(payload.statuses);
  }
  return undefined;
}

function normalizeStatusList(value) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  const list = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push(id);
  }
  return list.length ? list : undefined;
}

function normalizeStatus(value, statuses = DEFAULT_STATUSES) {
  return statuses.includes(value) ? value : undefined;
}
