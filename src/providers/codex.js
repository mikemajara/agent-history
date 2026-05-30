import path from "node:path";
import { expandHomePath } from "../lib/path-utils.js";
import { listFilesRecursive, pathExists } from "../lib/fs-walk.js";
import { readJsonl } from "../lib/jsonl.js";
import { parseDate } from "../lib/time.js";
import { compactPreview } from "../lib/text.js";

const CODEX_SESSIONS_ROOT = expandHomePath("~/.codex/sessions");

export async function discoverCodexSessions(targetCwd = undefined) {
  if (!(await pathExists(CODEX_SESSIONS_ROOT))) {
    return [];
  }

  const files = await listFilesRecursive(CODEX_SESSIONS_ROOT, (filePath) => filePath.endsWith(".jsonl"));
  const sessions = [];

  for (const filePath of files) {
    const session = await parseCodexSession(filePath, targetCwd);
    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}

async function parseCodexSession(filePath, targetCwd) {
  const records = await readJsonl(filePath);
  const sessionMeta = records.find((record) => record?.type === "session_meta");

  if (!sessionMeta?.payload?.cwd || (targetCwd && sessionMeta.payload.cwd !== targetCwd)) {
    return null;
  }

  const id = sessionMeta.payload.id ?? path.basename(filePath, ".jsonl");

  return {
    agent: "codex",
    id,
    startedAt: parseDate(sessionMeta.payload.timestamp ?? records[0]?.timestamp),
    updatedAt: parseDate(records.at(-1)?.timestamp ?? sessionMeta.payload.timestamp),
    cwd: sessionMeta.payload.cwd,
    preview: findCodexPreview(records),
    transcriptPath: filePath,
    resumeCommand: ["codex", "resume", id],
    metadata: {
      modelProvider: sessionMeta.payload.model_provider,
      cliVersion: sessionMeta.payload.cli_version,
      source: "codex",
      originator: sessionMeta.payload.originator,
    },
  };
}

function findCodexPreview(records) {
  for (const record of records) {
    if (record?.type !== "response_item" || record?.payload?.role !== "user") {
      continue;
    }

    const content = record?.payload?.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const item of content) {
      if (item?.type === "input_text" && typeof item.text === "string") {
        const preview = compactPreview(item.text);
        if (preview) {
          return preview;
        }
      }
    }
  }

  return undefined;
}
