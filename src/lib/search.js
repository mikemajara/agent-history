import { readJsonl } from "./jsonl.js";
import { extractTextFromContent } from "./text.js";

const K1 = 1.5;
const B = 0.75;

// System preamble patterns to skip when indexing
const PREAMBLE_RE = /^<(environment_context|permissions instructions|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions|local-command-|command-name)/;

function unwrapTurnText(text) {
  if (!text?.trim()) return "";
  const trimmed = text.trim();
  if (PREAMBLE_RE.test(trimmed)) return "";
  const m = trimmed.match(/^<user_query>\s*([\s\S]*?)\s*<\/user_query>$/);
  if (m) return m[1];
  return trimmed
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/g, "")
    .replace(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/g, "$1")
    .trim();
}

function extractTurnFromRecord(record, agent) {
  if (agent === "claude") {
    const type = record?.type;
    if (type !== "user" && type !== "assistant") return null;
    const content = record?.message?.content ?? record?.prompt;
    const raw = typeof content === "string" ? content : extractTextFromContent(content);
    const text = unwrapTurnText(raw);
    if (!text) return null;
    return { role: type, text };
  }

  if (agent === "cursor") {
    const role = record?.role;
    if (role !== "user" && role !== "assistant") return null;
    const content = record?.payload?.content ?? record?.message?.content;
    const raw = typeof content === "string" ? content : extractTextFromContent(content);
    const text = unwrapTurnText(raw);
    if (!text) return null;
    return { role, text };
  }

  if (agent === "codex") {
    if (record?.type !== "response_item" || record?.payload?.type !== "message") return null;
    const role = record?.payload?.role;
    if (role !== "user" && role !== "assistant") return null;
    const content = record?.payload?.content;
    if (!Array.isArray(content)) return null;
    const parts = content
      .map((item) => item?.text ?? item?.input_text ?? item?.output_text ?? "")
      .filter(Boolean);
    const text = unwrapTurnText(parts.join(" "));
    if (!text) return null;
    return { role, text };
  }

  return null;
}

async function extractTurns(filePath, agent) {
  let records;
  try {
    records = await readJsonl(filePath);
  } catch {
    return [];
  }
  const turns = [];
  for (const record of records) {
    const turn = extractTurnFromRecord(record, agent);
    if (turn) turns.push(turn);
  }
  return turns;
}

function tokenize(text) {
  return text.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
}

// Build BM25 index over all sessions. Called once on startup in background.
export async function buildIndex(sessions) {
  const BATCH = 60;
  const allTurns = [];

  for (let i = 0; i < sessions.length; i += BATCH) {
    const batch = sessions.slice(i, i + BATCH);
    const turns = await Promise.all(batch.map((s) => extractTurns(s.transcriptPath, s.agent)));
    allTurns.push(...turns);
  }

  const docs = sessions.map((s, i) => {
    const turns = allTurns[i];
    const fullText = turns.map((t) => t.text).join(" ");
    const tokens = tokenize(fullText);
    return { id: s.id, tokens, length: tokens.length, turns };
  });

  const termDf = new Map();
  for (const doc of docs) {
    const seen = new Set(doc.tokens);
    for (const term of seen) {
      termDf.set(term, (termDf.get(term) ?? 0) + 1);
    }
  }

  const totalLen = docs.reduce((sum, d) => sum + d.length, 0);
  const avgLen = docs.length > 0 ? totalLen / docs.length : 1;

  return { docs, termDf, avgLen, N: docs.length };
}

// Search sessions using BM25. Returns [{session, snippet}] sorted by relevance.
export function search(index, query, sessions) {
  if (!index || !query.trim()) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const { docs, termDf, avgLen, N } = index;
  const scores = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (doc.length === 0) continue;

    // Filter: every query token must appear as substring somewhere in this doc's full text
    const docText = doc.tokens.join(" ");
    const passesFilter = queryTokens.every((term) => docText.includes(term));
    if (!passesFilter) continue;

    const tf = new Map();
    for (const token of doc.tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    let score = 0;
    for (const term of queryTokens) {
      const df = termDf.get(term) ?? 0;
      if (df === 0) continue;

      // Exact + substring match weighted
      let effectiveTf = tf.get(term) ?? 0;
      for (const [token, count] of tf) {
        if (token !== term && token.includes(term)) {
          effectiveTf += count * 0.5;
        }
      }

      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      const norm =
        (effectiveTf * (K1 + 1)) /
        (effectiveTf + K1 * (1 - B + B * (doc.length / avgLen)));
      score += idf * norm;
    }

    if (score > 0) {
      scores.push({ index: i, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  return scores.map(({ index: i }) => {
    const doc = docs[i];
    const session = sessions[i];
    const snippet = findSnippet(doc.turns, queryTokens);
    return { session, snippet };
  });
}

function findSnippet(turns, queryTokens) {
  let bestTurn = null;
  let bestCount = 0;

  for (const turn of turns) {
    const lower = turn.text.toLowerCase();
    let count = 0;
    for (const term of queryTokens) {
      if (lower.includes(term)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestTurn = turn;
    }
  }

  if (!bestTurn) return undefined;

  const lower = bestTurn.text.toLowerCase();
  let firstMatchPos = bestTurn.text.length;
  for (const term of queryTokens) {
    const pos = lower.indexOf(term);
    if (pos !== -1 && pos < firstMatchPos) firstMatchPos = pos;
  }

  const WINDOW = 80;
  const start = Math.max(0, firstMatchPos - WINDOW);
  const end = Math.min(bestTurn.text.length, firstMatchPos + WINDOW);
  let snippet = bestTurn.text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < bestTurn.text.length) snippet += "…";

  return { text: snippet, role: bestTurn.role };
}
