import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { expandHomePath } from "../lib/path-utils.js";
import { pathExists } from "../lib/fs-walk.js";
import { compactPreview } from "../lib/text.js";

const DEFAULT_FX_ROOT = expandHomePath("~/.fx");

function resolveFxRoot(fxRoot = undefined) {
  if (fxRoot) return fxRoot;
  if (process.env.FX_DATA_DIR) return expandHomePath(process.env.FX_DATA_DIR);
  return DEFAULT_FX_ROOT;
}

export async function discoverFxSessions(targetCwd = undefined, fxRoot = undefined) {
  const root = resolveFxRoot(fxRoot);
  const sessionsRoot = path.join(root, "sessions");
  if (!(await pathExists(sessionsRoot))) return [];

  const indexById = await readFxIndex(sessionsRoot);
  const dirIds = await listSessionDirIds(sessionsRoot);
  const ids = new Set([...indexById.keys(), ...dirIds]);

  const sessions = [];
  for (const id of ids) {
    const session = await loadFxSession(sessionsRoot, id, indexById.get(id), targetCwd);
    if (session) sessions.push(session);
  }
  return sessions;
}

export async function extractFxTurns(session) {
  if (!session?.transcriptPath) return [];

  const turns = [];
  const stream = createReadStream(session.transcriptPath, { encoding: "utf8" });
  let buffer = "";

  try {
    for await (const chunk of stream) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        appendFxTurnFromLine(line, turns);
      }
    }
    if (buffer.trim()) appendFxTurnFromLine(buffer, turns);
  } catch {
    return turns;
  }

  return turns;
}

async function readFxIndex(sessionsRoot) {
  try {
    const raw = await fs.readFile(path.join(sessionsRoot, "index.json"), "utf8");
    const index = JSON.parse(raw);
    return new Map((index.sessions ?? []).map((entry) => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

async function listSessionDirIds(sessionsRoot) {
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "latest")
    .map((entry) => entry.name);
}

async function loadFxSession(sessionsRoot, id, indexEntry, targetCwd) {
  const sessionDir = path.join(sessionsRoot, id);
  const sessionPath = path.join(sessionDir, "session.json");
  if (!(await pathExists(sessionPath))) return null;

  const meta = JSON.parse(await fs.readFile(sessionPath, "utf8"));
  const cwd = meta.workspace_root ?? meta.origin_workspace_root ?? indexEntry?.workspace_root;
  if (targetCwd && cwd !== targetCwd) return null;

  const display = await readOptionalJson(path.join(sessionDir, "display.json"));
  const historyLen = meta.history_len ?? indexEntry?.history_len ?? 0;
  const preview =
    compactPreview(indexEntry?.preview) ??
    compactPreview(display?.preview) ??
    (historyLen > 0 ? await findFxPreviewFromEvents(sessionDir) : undefined);

  return {
    agent: "fx",
    id,
    startedAt: parseFxMs(meta.created_at_ms ?? indexEntry?.created_at_ms),
    updatedAt: parseFxMs(meta.updated_at_ms ?? indexEntry?.updated_at_ms),
    cwd,
    preview,
    transcriptPath: path.join(sessionDir, "events.jsonl"),
    resumeCommand: ["fx", "--resume", id],
    metadata: {
      source: "fx",
      title: indexEntry?.title ?? display?.title ?? "Untitled session",
      model: meta.preferences?.model,
      effort: meta.preferences?.effort,
      historyLen,
      conversationLanguage: meta.conversation_language ?? indexEntry?.conversation_language,
      totalInputTokens: meta.total_input_tokens,
      totalOutputTokens: meta.total_output_tokens,
    },
  };
}

async function findFxPreviewFromEvents(sessionDir) {
  const eventsPath = path.join(sessionDir, "events.jsonl");
  if (!(await pathExists(eventsPath))) return undefined;

  const stream = createReadStream(eventsPath, { encoding: "utf8" });
  let buffer = "";

  try {
    for await (const chunk of stream) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const preview = previewFromFxLine(line);
        if (preview) {
          stream.destroy();
          return preview;
        }
      }
    }
  } catch {
    return previewFromFxLine(buffer);
  }

  return previewFromFxLine(buffer);
}

function previewFromFxLine(line) {
  if (!line.trim()) return undefined;
  try {
    const record = JSON.parse(line);
    if (record?.kind !== "history_turn_committed") return undefined;
    return compactPreview(record.payload?.turn?.user?.text);
  } catch {
    return undefined;
  }
}

function appendFxTurnFromLine(line, turns) {
  if (!line.trim()) return;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }
  if (record?.kind !== "history_turn_committed") return;

  const turn = record.payload?.turn;
  const userText = turn?.user?.text;
  const assistantText = typeof turn?.assistant === "string" ? turn.assistant : "";

  if (userText) turns.push({ role: "user", text: userText });
  if (assistantText) turns.push({ role: "assistant", text: assistantText });
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function parseFxMs(value) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
