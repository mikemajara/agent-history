# Refinement: Issue #9 — Scrollable session transcript view

Generated: 2026-08-20

**Issue:** https://github.com/mikemajara/agent-history/issues/9

**Selected because:** open issue with no labels, no comments, and no `agent-ready` status. Structured skeleton exists but lacks current-state analysis, concrete navigation/layout contract, and implementation binding. Blocker #3 (session metadata cache) is **closed** — prerequisite met.

## Problem (reframed)

The always-on preview pane shows **metadata plus a bounded conversation excerpt** (`buildConversationExcerpt` in `src/tui/render.js`). It jumps to search matches and clips to the preview budget with `...`. That is the right default for browsing, but users sometimes need the **full transcript** — long multi-turn threads, code blocks, or context beyond a few wrapped lines — without leaving `agent-history` or shelling out to agent CLIs.

## Current state (main @ v0.9.0)

- **No transcript mode.** `createBrowserState()` has `mode: "normal" | "search"` only; no `"transcript"` mode or scroll offset (`src/tui/state.js`).
- **No Ctrl+T handler.** `handleNormalInput()` / `handleSearchInput()` have no `key.name === "t"` with `ctrl: true`. Rehaul plan deferred transcript mode here with **`Ctrl+T`** (`.backlog/plans/PLAN-session-browser-rehaul.md`).
- **Turns already indexed in memory.** `buildIndex()` in `src/lib/search.js` parses every session's JSONL (or provider DB/stream — including fx since v0.9.0) into `{ role, text }[]` and stores them on `searchIndex.docs[i].turns`. This happens once per browser launch in the background (`src/tui.js`).
- **Preview reuses indexed turns.** `renderReferenceDetails()` reads `state.searchIndex?.docs?.[state.sessions.indexOf(session)]?.turns` and renders a clipped excerpt with markdown + search highlighting. No per-frame file I/O.
- **Indexing gate.** While `state.indexing === true`, turns are unavailable; preview falls back to `session.preview` only.
- **Sensitive sessions.** `--no-preview` suppresses conversation text in the preview pane (`src/tui/render.js` early exit); transcript mode must respect the same flag.
- **Prerequisites met.** Issues #2 (browser rehaul + preview pane) and #3 (metadata cache) are closed. Session listing is cached at `~/.cache/agent-history/sessions-v1.json`; BM25 turn index still builds in-memory each launch.
- **Out of scope overlap.** Comfortable-density rows (#10) wrap more prompt text in the **list**; transcript mode is a separate full-conversation view, not row density.

### Verification (2026-08-20)

- `npm test` — **114/114 pass** on main (v0.9.0)
- Grep confirms no `transcript` mode, no `Ctrl+T`, no `transcriptScrollOffset` in `src/`
- `buildConversationExcerpt()` still clips preview to terminal budget; no scroll state in preview path

## Goal

Add a dedicated **scrollable transcript view** for the selected session. Enter from the browser, scroll the full normalized turn list, and return to the browser without losing selection, search, filter, sort, or viewport position.

## Requirements

### Interaction

- **`Ctrl+T`** enters transcript mode for the **currently selected** session (normal and search modes).
- **`Esc`** exits transcript mode back to the browser. Preserve `selectedId`, search query, scope, sort, focused control, preview-pane visibility, and list scroll anchor.
- **Within transcript:** `j`/`k` and arrow keys scroll by one line; `Page Up`/`Page Down` scroll by one viewport; `Home`/`End` jump to start/end.
- **`Enter`** still resumes the session (exit transcript + launch resume command, same as browser).
- **`Ctrl+n`** still starts a new session in directory.
- **`q`** quits the app from transcript mode (same as browser).
- Block **`Ctrl+T`** while `state.indexing === true` or when `--no-preview` is active (show a one-line message instead).
- Update `?` help and README interactive key table.

### Transcript layout contract

Transcript mode uses the **full terminal body** (list + preview hidden). Footer reservation unchanged (3 rows).

**Header (4 rows):**

1. `Session transcript`
2. blank
3. `{agent badge} · {truncated session id} · {turn count} turns` (truncate id with `…` at narrow widths)
4. `─` separator to full width

**Turn rendering:**

```text
you:
  {markdown-wrapped user text}
ai:
  {markdown-wrapped assistant text}
```

- Reuse `formatMarkdownLines`, `wrapReferenceText`, and `highlightMatches` from the preview pane for consistency.
- One blank line between turns.
- Role labels: `you:` / `ai:` (same as preview excerpt).
- **`--no-preview`:** do not enter transcript mode; if forced programmatically, show `Preview disabled (--no-preview).`

**Scrolling:**

- Maintain `transcriptScrollOffset` (0-based line index into the flattened turn lines).
- Auto-scroll so the first search-match turn is visible when entering from an active search query (reuse `freeTextTerms` + earliest matching turn logic from `buildConversationExcerpt`).
- Clip lines that exceed the body budget; never wrap the footer.

**Empty / loading / malformed states:**

| State | Display |
| --- | --- |
| Indexing in progress | `Loading transcript…` centered in body; `Esc` returns to browser |
| Zero turns after index | `No conversation turns found.` |
| Turns unavailable (missing path) | `Transcript file unavailable.` |
| Malformed JSONL (partial parse) | Render whatever turns were extracted; no error spam |

### Data / memory

- **Do not re-read transcript files per render.** Source turns exclusively from `searchIndex.docs[sessionIndex].turns`.
- **Lazy index entry:** if a session was added after index build (edge case), fall back to a one-shot `extractTurns(session)` on enter; cache result on the doc entry.
- **Memory note:** `buildIndex()` already holds all turn text in memory for BM25 (~129 MB footprint observed in rehaul plan for 612 sessions). Transcript mode adds **view state only** (scroll offset), not a second copy. Document this in the issue; optional future work could stream turns on demand for `--deep-search` scale histories.

### Out of scope

- Comfortable-density list rows (#10).
- Persisting scroll position across launches.
- Deep transcript search / grep within transcript mode (search already filters the session list; excerpt anchoring is enough for v1).
- Editing or exporting transcripts.

## Acceptance criteria

- [ ] `Ctrl+T` opens full-width transcript view; `Esc` restores prior browser state (selection + filters unchanged).
- [ ] Transcript scrolls through **all** indexed turns with j/k, arrows, Page Up/Down, Home/End.
- [ ] Search-enter anchors scroll to earliest matching turn when free-text query is active.
- [ ] Indexing, empty, unavailable, and `--no-preview` states match the table above.
- [ ] No per-render transcript file reads (verified by test stub or integration assertion).
- [ ] Golden fixtures at **100×30** and **60×16** in `test/tui-render.test.js` for transcript mode: default scroll, search-anchored, empty, indexing.
- [ ] `npm test` passes; state tests cover enter/exit + scroll + selection retention.
- [ ] README and `?` help document transcript mode.

## Suggested labels

`type:feat` · `priority:medium` · `agent-ready` · `status:ready`

## Recommendation

**Implement as a third browser mode** (`state.mode = "transcript"`) with dedicated render path in `src/tui/render.js` and input handling in `src/tui/state.js`. Start with golden-frame tests for the layout contract, then wire `Ctrl+T` / scroll keys. Turns are already parsed — this is primarily UI/navigation work. Coordinate with #10 (comfortable density) only on shared footer/help text; no shared viewport logic. Related: #2 (done), #3 (done), #4 (`--no-preview` gate).
