---
slug: session-browser-rehaul
status: done
issue: https://github.com/mikemajara/agent-history/issues/2
prd:
created_at: 2026-07-28T15:52:23Z
---

# Plan: Session browser layout and details

## Summary

Deliver the cohesive work needed to close GitHub Issue #2: normalized metadata,
Cwd/All filtering over one all-session collection, Created/Updated sorting,
search, a concrete compact-list frame, and an inline Ctrl+E details block.
Codex, Claude, and Cursor share the same layout; provider-specific fields appear
only when their local transcript data supplies them.

Ctrl+O comfortable density and Ctrl+T transcript mode are separate follow-ups,
not part of this plan.

## Feasibility

The work is feasible without a proprietary agent database or agent CLI calls:

- Existing parsers normalize session ID, created/updated timestamps, preview,
  transcript path, resume command, and a project reference.
- Existing transcript indexing supplies search snippets and the bounded
  conversation excerpt required by expanded details.
- Codex branch data was observed in real local session metadata at
  `session_meta.payload.git.branch`; implementation must capture that exact
  shape in a fixture before relying on it. Claude exposes `gitBranch`.
  Cursor branch/model/directory fields are less consistent and remain optional.
- Cursor all-project discovery retains its encoded project slug. Cwd filtering
  can compare it with the encoded target path without reverse-decoding it.
- A local baseline over 612 sessions completed discovery in about 0.58 seconds
  and indexing in about 0.73 seconds. The 129 MB index footprint supports
  deferring a full transcript mode to Issue #9 and coordinating it with cache
  work in Issue #3.

The current raw `readline`/ANSI renderer can support the contract below. A TUI
framework migration is unnecessary.

## Scope

In scope:

- Shared metadata projection for Codex, Claude, and Cursor.
- Provider-aware Cwd matching.
- Cwd/All and Created/Updated controls.
- Text search, stable selection, and viewport windowing.
- The compact list frame and inline Ctrl+E details.
- Responsive rendering, resize cleanup, tests, and documentation.

Out of scope:

- Comfortable density: Issue #10.
- Scrollable transcript view: Issue #9, blocked by cache/memory Issue #3.
- Persistent caching, resume handoff changes, and sensitive-preview mode.

## Baseline strategy

Before the rehaul begins, isolate the current uncommitted provider metadata and
details-panel work, run `npm test`, and commit it as a green checkpoint. Only
then refactor `src/tui.js` or `src/tui/state.js`. This preserves a bisectable
baseline and prevents the extraction from silently replacing unreviewed work.

## Interaction contract

- `agent-history` loads all sessions and starts with `All` selected.
- `agent-history [path]` also loads all sessions, resolves the path, and starts
  with `Cwd` selected. Cwd is a filter over the all-session collection, not a
  narrower discovery load, so switching to All never requires another scan.
- Tab alternates focus between Filter and Sort. Left/Right cycles the focused
  control between Cwd/All or Updated/Created.
- Printable input edits the search query directly; Backspace removes one
  character and Ctrl+U clears it. Up/Down moves the selected session.
- Ctrl+E expands or collapses the selected session.
- Enter returns the existing resume command.
- Esc collapses details first, then clears a non-empty query, then exits.
  Ctrl+C exits immediately.
- Derived sessions are calculated in this order: scope filter, text match,
  selected timestamp sort, then viewport windowing. Selection is retained by
  session ID and clamped only when that session leaves the derived result.

## Layout contract

The canonical render fixture is a 100-column by 30-row terminal. The minimum
supported fixture is 60 columns by 16 rows.

### Header

For widths of 100 or more:

1. Row 1 is exactly `Resume a previous session`.
2. Row 2 is blank.
3. Row 3 contains `Type to search` when the query is empty, otherwise the query.
   The selected controls are right-aligned on the same row with three spaces
   between groups:
   `Filter: Cwd [All]   Sort: [Updated] Created`.
4. Row 4 is blank.

Brackets identify the selected value, producing these exact alternatives:

- `Filter: [Cwd] All`
- `Filter: Cwd [All]`
- `Sort: [Updated] Created`
- `Sort: Updated [Created]`

Search text truncates to the width remaining before the controls and never
pushes them off-screen.

Focus is represented by ANSI styling and must not alter the plain-text contract.
For widths from 60 through 99, the search text remains on row 3 and the controls
move, left-aligned, to row 4; the list begins after one blank row.

### Session rows

After stripping ANSI, every collapsed row uses this exact column order:

```text
{marker} {age:9} {provider:7} {preview}
```

- `marker` is `›` for the selected collapsed row, `⌄` for the selected expanded
  row, and one space otherwise.
- `age` is a short relative value such as `2m ago`, padded to 9 columns. It uses
  `updatedAt` under Updated sort and `startedAt` under Created sort.
- `provider` is lowercase `codex`, `claude`, or `cursor`, padded to 7 columns.
- `preview` is whitespace-normalized, uses `-` when missing, and truncates with
  `...` to keep the row at the terminal width.
- Rows never wrap. The selected row uses inverse video; alternating unselected
  rows use dim styling. Under `NO_COLOR`, marker and column positions still
  identify selection and row structure.

### Expanded details

Ctrl+E inserts the block immediately after the selected row. Every line begins
with `  │ ` and fields use this exact order and labels:

```text
  │ Session:      <full id>
  │ Provider:     <provider>
  │ Model:        <model>
  │ Created:      <relative> · <YYYY-MM-DD HH:mm:ss>
  │ Updated:      <relative> · <YYYY-MM-DD HH:mm:ss>
  │ Directory:    <canonical path or exact project reference>
  │ Branch:       <recorded branch>
  │ Resume:       <resume command>
  │ Conversation:
  │ you: <first user turn>
  │ ai:  <following assistant turn>
```

Conversation includes at most the first user turn and the immediately following
assistant turn from the existing index, in transcript order. It falls back to
the session preview while indexing or when turns are unavailable. Text wraps
within the same `  │ ` guide and clips to the remaining list budget with a final
`  │ ...` line. Model and Branch are omitted when unavailable, without leaving
blank rows.

### Footer

The final three terminal rows are reserved and never consumed by the list:

1. A `─` separator repeated to the visible terminal width.
2. Exactly:
   `enter resume   esc exit   ctrl+c exit   tab focus filter/sort   ←/→ change option`
3. Left: `ctrl+e expand   ↑/↓ browse`; right:
   `<selected position> / <visible count> · <scroll percent>%`

At widths below 100, row 2 becomes
`enter resume   esc exit   tab focus   ←/→ option`; row 3 keeps the same left
text and right status. Footer lines must truncate at visible width rather than
wrap.

## Data availability

| Field | Codex | Claude | Cursor | Rendering rule |
| --- | --- | --- | --- | --- |
| ID | Yes | Yes | Yes | Always show |
| Created/updated | Yes | Yes, with file-time fallback | Yes, with file-time fallback | Always show when valid |
| Prompt/conversation | Yes | Usually | Usually | Fall back from turns to preview to `-` |
| Directory | Yes | Yes | Often only an encoded project slug in all-project discovery | Never reverse-decode a slug into a path |
| Branch | `session_meta.payload.git.branch` | `gitBranch` | Not reliably present | Omit when absent; never substitute the current Git branch |
| Model | `turn_context.payload.model` | Message/user metadata | Provider-record dependent | Omit when absent |
| Resume command | Yes | Yes | Yes | Preserve existing command behavior |

## Tasks

- [x] Commit the current uncommitted provider metadata, details panel, and its
  tests as an isolated green baseline before beginning the rehaul. Verify with
  `npm test`; do not mix the renderer/state refactor into this checkpoint.
- [x] Complete the normalized metadata projection in `src/types.js` and
  `src/providers/{codex,claude,cursor}.js`. Add a captured Codex
  `session_meta.payload.git.branch` fixture and retain optional-field coverage
  in `test/{codex,claude,cursor}.test.js`.
- [x] Add provider-aware project matching in `src/session-index.js` and/or
  `src/lib/path-utils.js`: canonical `cwd` when present, encoded-slug comparison
  when Cursor lacks a path, and no reverse-decoding. Add path-matching tests.
- [x] Change interactive startup in `src/cli.js` to call `getAllSessions()` for
  both invocation forms, then pass the resolved current/explicit path and
  initial scope to the browser. Keep `agent-history ls [path]` strictly
  filtered. State coverage proves the path form starts filtered while retaining
  the preloaded All collection without another discovery call.
- [x] Refactor `src/tui/state.js` around `scope`, `sort`, `focusedControl`,
  query, selected-session ID, expanded-session ID, and viewport state.
  Implement the interaction and derivation contracts above and cover every
  transition in `test/tui-state.test.js`.
- [x] After the baseline commit, extract pure frame composition from
  `src/tui.js` into `src/tui/render.js`. Centralize ANSI styling, visible-width
  truncation, relative time, alignment, and `NO_COLOR` handling without changing
  terminal lifecycle behavior in the same step.
- [x] Implement the exact header, row, expanded-details, and footer contracts in
  `src/tui/render.js`. Reuse indexed turns for the bounded two-turn conversation
  excerpt and budget expanded lines before calculating the visible list window.
- [x] Update `src/lib/search.js` so provider schema variants and normalized
  metadata are searchable, then apply explicit Created/Updated sorting after
  matching. Preserve snippets without allowing relevance to override the
  selected sort.
- [x] Add deterministic frame fixtures in `test/tui-render.test.js` for 100x30
  and 60x16 terminals: default, Cwd/Created, expanded, empty, searching, and
  indexing states. Assert exact plain-text labels and column starts, ANSI
  selection semantics, optional-field omission, and visible-width limits.
- [x] Add resize/listener/raw-mode cleanup coverage in `src/tui.js`, then update
  `README.md` and CLI help with the exact controls, initial-scope behavior,
  provider limitations, and local-file-only data policy.

## Machine-checkable verification

- `npm test` passes from the baseline checkpoint and after every task.
- Provider fixtures prove Codex branch extraction from the captured payload and
  graceful absence for older/provider variants.
- State tests prove filter-search-sort order, stable timestamp ties, selection
  retention, Esc layering, and no filesystem discovery during UI transitions.
- The 100x30 golden frame contains the exact header/control/footer strings,
  session column starts, and expanded-field order defined above.
- The 60x16 golden frame uses the narrow header/footer contract, clips expanded
  content predictably, and has no line wider than 60 visible columns.
- Cwd matching tests include Codex/Claude canonical paths and Cursor encoded
  slugs without inferred display paths.
- Terminal lifecycle tests restore cursor visibility, raw mode, resize
  listeners, and key listeners after Enter, Esc, and Ctrl+C.

## Manual visual verification

- Compare the 100x30 and wide-terminal frames with the supplied reference
  screenshots for spacing, hierarchy, selected-row emphasis, and expanded-block
  readability. The asserted layout contract wins if terminal rendering differs
  by theme.
- Smoke-test `agent-history`, `agent-history .`, and
  `agent-history ~/github/example` against real Codex, Claude, and Cursor
  histories.
- Switch Cwd/All and Created/Updated repeatedly, including during search, and
  confirm selection and viewport remain understandable.
- Resize between 60x16, 100x30, and a wide terminal while details are expanded;
  confirm there is no wrapping, stale content, or cursor flicker.
- Inspect sessions with missing preview, model, branch, or canonical Cursor
  directory and confirm the layout does not invent or mislabel data.
- Confirm the initial frame appears before transcript indexing completes and
  remains responsive at the measured local history size.

## Risks

- The renderer/state extraction will churn the current details implementation.
  The green baseline commit is required before that extraction begins.
- Cursor's encoded project slug can match a known Cwd but cannot reconstruct an
  arbitrary display path. Show it as a project reference when necessary.
- Historical model and branch coverage varies. Missing values must be omitted,
  never guessed from the current repository.
- ANSI and Unicode markers break alignment if raw string length is used.
  Clipping and padding must use visible terminal width.
- Expanded content can overwhelm a short terminal. Reserve the footer and clip
  with the exact terminal-visible ellipsis line.

## Notes

- Canonical details work: Issue #2.
- Deferred follow-ups: Issue #9 (scrollable transcript view, blocked by Issue
  #3) and Issue #10 (comfortable-density rows).
- Related work that remains separate: Issue #1 (resume handoff), Issue #3
  (cache), and Issue #4 (sensitive preview mode).
- This plan does not read undocumented proprietary databases, execute agent
  CLIs during discovery, or change resume execution behavior.
