import { DatabaseSync } from "node:sqlite";
import { expandHomePath } from "../lib/path-utils.js";
import { compactPreview, unwrapPromptText } from "../lib/text.js";

const OPENCODE_DB_PATH = process.env.OPENCODE_DATABASE_PATH ?? expandHomePath("~/.local/share/opencode/opencode.db");

export async function discoverOpenCodeSessions(targetCwd = undefined, databasePath = OPENCODE_DB_PATH) {
  return withDatabase(databasePath, (db) => {
    const rows = db.prepare(`
      SELECT id, directory, title, agent, model, time_created, time_updated
      FROM session
      WHERE time_archived IS NULL
      ORDER BY time_updated DESC
    `).all();
    const previews = findOpenCodePreviews(db);

    return rows
      .filter((row) => !targetCwd || row.directory === targetCwd)
      .map((row) => toSession(row, previews.get(row.id), databasePath));
  });
}

export async function extractOpenCodeTurns(session) {
  if (!session?.id) return [];

  return withDatabase(session.transcriptPath ?? OPENCODE_DB_PATH, (db) => {
    const rows = db.prepare(`
      SELECT m.id AS message_id, m.data AS message_data, p.data AS part_data
      FROM message m
      LEFT JOIN part p ON p.message_id = m.id
      WHERE m.session_id = ?
      ORDER BY m.time_created, p.time_created
    `).all(session.id);
    return toTurns(rows);
  });
}

function findOpenCodePreviews(db) {
  const rows = db.prepare(`
    SELECT m.session_id, m.id AS message_id, p.data AS part_data
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
    ORDER BY m.time_created, p.time_created
  `).all();
  const previews = new Map();

  for (const row of rows) {
    if (previews.has(row.session_id)) continue;
    const text = getTextPart(row.part_data);
    const preview = compactPreview(text);
    if (preview) previews.set(row.session_id, preview);
  }

  return previews;
}

function toSession(row, preview, databasePath) {
  const model = parseJson(row.model);
  return {
    agent: "opencode",
    id: row.id,
    startedAt: parseEpoch(row.time_created),
    updatedAt: parseEpoch(row.time_updated),
    cwd: row.directory,
    preview: preview ?? compactPreview(row.title),
    transcriptPath: databasePath,
    resumeCommand: ["opencode", "--session", row.id],
    metadata: {
      source: "opencode",
      agent: row.agent,
      model: model?.id ?? model?.modelID ?? row.model,
      modelProvider: model?.providerID,
      title: row.title,
    },
  };
}

function toTurns(rows) {
  const messages = new Map();
  for (const row of rows) {
    const message = parseJson(row.message_data);
    const role = message?.role;
    if (role !== "user" && role !== "assistant") continue;

    let turn = messages.get(row.message_id);
    if (!turn) {
      turn = { role, parts: [] };
      messages.set(row.message_id, turn);
    }
    const text = getTextPart(row.part_data);
    if (text) turn.parts.push(text);
  }

  return [...messages.values()]
    .map((turn) => ({ role: turn.role, text: unwrapPromptText(turn.parts.join(" ")) }))
    .filter((turn) => turn.text);
}

function getTextPart(data) {
  const part = parseJson(data);
  return part?.type === "text" && typeof part.text === "string" ? part.text : "";
}

function parseJson(value) {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseEpoch(value) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function withDatabase(databasePath, callback) {
  let db;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true });
    return callback(db);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}
