---
slug: fx-provider
status: ready
issue: https://github.com/mikemajara/agent-history/issues/20
prd:
created_at: 2026-08-12T00:42:00Z
---

# Plan: fx provider for agent-history

## Summary

Add [fx](https://fx.sh/docs) (Vercel's terminal coding agent) as a fifth session
provider. fx stores sessions under `~/.fx/sessions/` with a fast catalog in
`index.json`, per-session metadata in `<id>/session.json`, optional title/preview
in `<id>/display.json`, and conversation turns in `<id>/events.jsonl`.

Discovery must read local files only — never shell out to `fx sessions` during
indexing. Resume may launch `fx --resume <id>` after the user explicitly chooses
a session, matching existing provider behavior.

## Feasibility (verified on this machine)

| Source | Path | Notes |
|--------|------|-------|
| Catalog | `~/.fx/sessions/index.json` | 18 sessions; includes `id`, timestamps, `workspace_root`, `title`, `preview`, `history_len` |
| Metadata | `~/.fx/sessions/<id>/session.json` | Model in `preferences.model`, token counts, `history_len` |
| Display | `~/.fx/sessions/<id>/display.json` | Title/preview when `display_metadata_present: true` in index |
| Transcript | `~/.fx/sessions/<id>/events.jsonl` | User/assistant text in `history_turn_committed` events |
| Resume | CLI | `fx --resume <id>` or `fx --resume-<id>` from the session cwd |

Path matching is direct cwd equality on `workspace_root` (same pattern as Codex
and OpenCode). No slug encoding.

**Index lag:** one session dir existed on disk but was missing from
`index.json` (empty agent-history session). Implementation must scan session
directories and merge with index entries so new sessions appear before the
catalog catches up.

**Large logs:** `events.jsonl` can exceed 3 MB. Listing must not read event
logs. Search turn extraction must stream lines and filter by
`kind === "history_turn_committed"` only.

## AgentSession mapping

```ts
// src/types.js — extend union
@property {"cursor"|"claude"|"codex"|"opencode"|"fx"} agent

// Normalized session shape
{
  agent: "fx",
  id: "1785253599548-1785253599548270000-d92781765b7a2a9d",
  startedAt: new Date(1785253599548),
  updatedAt: new Date(1785363458301),
  cwd: "/Users/miguel/src/tries/2026-07-16-hub",
  preview: "study these files, they're a plain html prototype for a new internal application we're building",
  transcriptPath: "/Users/miguel/.fx/sessions/1785253599548-1785253599548270000-d92781765b7a2a9d/events.jsonl",
  resumeCommand: ["fx", "--resume", "1785253599548-1785253599548270000-d92781765b7a2a9d"],
  metadata: {
    source: "fx",
    title: "study these files, they're a plain html prototype",
    model: "moonshotai/kimi-k3",
    effort: "medium",
    historyLen: 8,
    conversationLanguage: "und-Latn",
    totalInputTokens: 80957,
    totalOutputTokens: 255,
  },
}
```

Preview resolution order:

1. `index.json` entry `preview`
2. `display.json` `preview`
3. First `payload.turn.user.text` from a `history_turn_committed` event (only
   when preview is still missing and `history_len > 0`)

Title falls back to `"Untitled session"` when absent.

## Tasks

### 1. Add `src/providers/fx.js`

Create the provider module. Constants and path resolution:

```js
import path from "node:path";
import fs from "node:fs/promises";
import { expandHomePath } from "../lib/path-utils.js";
import { pathExists } from "../lib/fs-walk.js";
import { compactPreview } from "../lib/text.js";

const FX_ROOT = process.env.FX_DATA_DIR ?? expandHomePath("~/.fx");
const FX_SESSIONS_ROOT = path.join(FX_ROOT, "sessions");
const FX_INDEX_PATH = path.join(FX_SESSIONS_ROOT, "index.json");
```

Index + directory scan (handles index lag):

```js
export async function discoverFxSessions(targetCwd = undefined) {
  if (!(await pathExists(FX_SESSIONS_ROOT))) return [];

  const indexById = await readFxIndex();
  const dirIds = await listSessionDirIds();
  const ids = new Set([...indexById.keys(), ...dirIds]);

  const sessions = [];
  for (const id of ids) {
    const session = await loadFxSession(id, indexById.get(id), targetCwd);
    if (session) sessions.push(session);
  }
  return sessions;
}

async function readFxIndex() {
  try {
    const raw = await fs.readFile(FX_INDEX_PATH, "utf8");
    const index = JSON.parse(raw);
    return new Map((index.sessions ?? []).map((entry) => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

async function listSessionDirIds() {
  const entries = await fs.readdir(FX_SESSIONS_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "latest")
    .map((entry) => entry.name);
}
```

Session assembly — read `session.json`, merge index/display, filter by cwd:

```js
async function loadFxSession(id, indexEntry, targetCwd) {
  const sessionDir = path.join(FX_SESSIONS_ROOT, id);
  const sessionPath = path.join(sessionDir, "session.json");
  if (!(await pathExists(sessionPath))) return null;

  const meta = JSON.parse(await fs.readFile(sessionPath, "utf8"));
  const cwd = meta.workspace_root ?? meta.origin_workspace_root ?? indexEntry?.workspace_root;
  if (targetCwd && cwd !== targetCwd) return null;

  const display = await readOptionalJson(path.join(sessionDir, "display.json"));
  const preview =
    compactPreview(indexEntry?.preview) ??
    compactPreview(display?.preview) ??
    (meta.history_len > 0 ? await findFxPreviewFromEvents(sessionDir) : undefined);

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
      historyLen: meta.history_len ?? indexEntry?.history_len ?? 0,
      conversationLanguage: meta.conversation_language ?? indexEntry?.conversation_language,
      totalInputTokens: meta.total_input_tokens,
      totalOutputTokens: meta.total_output_tokens,
    },
  };
}

function parseFxMs(value) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
```

Turn extraction for BM25 search — stream, do not load full file:

```js
export async function extractFxTurns(session) {
  if (!session?.transcriptPath) return [];

  const turns = [];
  const stream = (await import("node:fs")).createReadStream(session.transcriptPath, {
    encoding: "utf8",
  });

  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      appendFxTurnFromLine(line, turns);
    }
  }
  if (buffer.trim()) appendFxTurnFromLine(buffer, turns);
  return turns;
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
```

Optional preview helper (read until first committed turn):

```js
async function findFxPreviewFromEvents(sessionDir) {
  const eventsPath = path.join(sessionDir, "events.jsonl");
  if (!(await pathExists(eventsPath))) return undefined;

  const stream = (await import("node:fs")).createReadStream(eventsPath, { encoding: "utf8" });
  let buffer = "";
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
```

`discoverAllFxSessions()` can alias `discoverFxSessions()` with no cwd filter,
matching Codex/OpenCode.

### 2. Wire into session index

`src/session-index.js`:

```js
import { discoverFxSessions } from "./providers/fx.js";

export async function getSessionsForCwd(inputCwd) {
  const targetCwd = await resolveTargetCwd(inputCwd);
  const [cursor, claude, codex, opencode, fx] = await Promise.all([
    discoverCursorSessions(targetCwd),
    discoverClaudeSessions(targetCwd),
    discoverCodexSessions(targetCwd),
    discoverOpenCodeSessions(targetCwd),
    discoverFxSessions(targetCwd),
  ]);
  return [...cursor, ...claude, ...codex, ...opencode, ...fx].sort(compareSessionsDesc);
}

export async function getAllSessions() {
  const [cursor, claude, codex, opencode, fx] = await Promise.all([
    discoverAllCursorSessions(),
    discoverAllClaudeSessions(),
    discoverCodexSessions(),
    discoverOpenCodeSessions(),
    discoverFxSessions(),
  ]);
  return [...cursor, ...claude, ...codex, ...opencode, ...fx].sort(compareSessionsDesc);
}
```

No change to `matchesSessionCwd` — fx sessions always carry `cwd`.

### 3. Wire search turn extraction

`src/lib/search.js`:

```js
import { extractFxTurns } from "../providers/fx.js";

async function extractTurns(session) {
  if (session.agent === "opencode") return extractOpenCodeTurns(session);
  if (session.agent === "fx") return extractFxTurns(session);
  // existing jsonl path for cursor/claude/codex
}
```

### 4. Support new-session launch

`src/lib/launch-command.js`:

```js
const NEW_SESSION_COMMANDS = {
  claude: ["claude"],
  cursor: ["cursor-agent"],
  codex: ["codex"],
  opencode: ["opencode"],
  fx: ["fx"],
};
```

### 5. Add tests — `test/fx.test.js`

Use a temp directory tree mirroring real fx layout. Do not depend on
`~/.fx` in CI.

Fixture layout:

```text
/tmp/agent-history-fx-XXXX/
  sessions/
    index.json
    ses_test/
      session.json
      display.json
      events.jsonl
```

Minimal `index.json`:

```json
{
  "schema_version": 3,
  "sessions": [{
    "id": "ses_test",
    "created_at_ms": 1760000000000,
    "updated_at_ms": 1760000010000,
    "workspace_root": "/tmp/fx-project",
    "title": "Build the fx provider",
    "preview": "Build the fx provider",
    "history_len": 1,
    "conversation_language": "en"
  }]
}
```

Minimal `session.json`:

```json
{
  "id": "ses_test",
  "created_at_ms": 1760000000000,
  "updated_at_ms": 1760000010000,
  "workspace_root": "/tmp/fx-project",
  "history_len": 1,
  "preferences": { "model": "moonshotai/kimi-k3", "effort": "medium" },
  "total_input_tokens": 100,
  "total_output_tokens": 50
}
```

Minimal `events.jsonl` (one turn):

```jsonl
{"kind":"session_started","timestamp_ms":1760000000000,"payload":{"id":"ses_test"}}
{"kind":"history_turn_committed","timestamp_ms":1760000001000,"payload":{"turn":{"kind":"assistant","user":{"text":"Build the fx provider","images":[]},"assistant":"I will add it."}}}
```

Test assertions (mirror `test/opencode.test.js`):

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverFxSessions, extractFxTurns } from "../src/providers/fx.js";

test("fx sessions use index metadata, event-log previews, and resume commands", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-history-fx-"));
  // write fixtures under root/sessions/...
  process.env.FX_DATA_DIR = root;

  const sessions = await discoverFxSessions("/tmp/fx-project");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.agent, "fx");
  assert.equal(sessions[0]?.preview, "Build the fx provider");
  assert.deepEqual(sessions[0]?.resumeCommand, ["fx", "--resume", "ses_test"]);
  assert.equal(sessions[0]?.metadata?.model, "moonshotai/kimi-k3");
  assert.deepEqual(await extractFxTurns(sessions[0]), [
    { role: "user", text: "Build the fx provider" },
    { role: "assistant", text: "I will add it." },
  ]);
});
```

Additional cases:

- [ ] cwd filter excludes sessions from other workspaces
- [ ] session dir present but missing from index is still discovered
- [ ] empty session (`history_len: 0`) returns no preview and no turns
- [ ] `FX_DATA_DIR` override works (restore env in `finally`)

Optional: add a search integration assertion that `/Build/` finds the fx
session once `buildIndex` runs.

### 6. Update docs

`CLAUDE.md` — add fx to Initial providers:

```markdown
- fx: `~/.fx/sessions/index.json`, `~/.fx/sessions/<id>/session.json`, and `~/.fx/sessions/<id>/events.jsonl`
```

Mention `FX_DATA_DIR` override for tests and non-default installs if documented
elsewhere for `OPENCODE_DATABASE_PATH`.

## Verification

```bash
npm test

# Manual smoke (requires local ~/.fx data)
node bin/agent-history.js ls --all | rg fx
node bin/agent-history.js ls /Users/miguel/src/tries/2026-07-16-hub | rg fx
node bin/agent-history.js show <fx-session-id>
node bin/agent-history.js resume <fx-session-id>
# Expected resume output:
# cd '/Users/miguel/src/tries/2026-07-16-hub' && fx --resume <id>
```

Interactive TUI:

```bash
agent-history
# fx rows appear with agent column "fx"
# /search terms from fx prompts return matches
# Enter launches fx --resume <id> in session cwd
# Ctrl+n in fx cwd launches plain `fx`
```

Performance check on this machine (18 fx sessions):

- Discovery should stay under ~50 ms (index + small JSON reads only).
- Full `npm test` should remain green; no regression in existing providers.

## Risks

| Risk | Mitigation |
|------|------------|
| `events.jsonl` grows large | Stream lines; never `readJsonl()` the full file at listing time |
| Index/catalog drift | Union index ids with directory scan |
| fx schema changes | Gate on `schema_version` fields; tolerate missing optional keys |
| Sessions with `workspace_root: "/"` | Include them; cwd filter naturally excludes unless user targets `/` |
| `history_turn_committed` turn kinds other than `assistant` | Extract user text whenever present; assistant text only when string (background_command turns may have empty assistant) |

## Notes

- Do not call `fx sessions --json` during discovery; it violates the project's
  "parse local files only" rule. The CLI output was used only to validate field
  names during exploration.
- `~/.fx/history.jsonl` is global prompt history, not session-linked — skip it.
- Resume flag `--resume-<id>` is equivalent to `--resume <id>`; prefer the
  spaced form for readability in `formatResumeCommand` output.
- If fx later stores git branch or version in `session.json`, add optional
  metadata fields without changing the normalized session shape.
