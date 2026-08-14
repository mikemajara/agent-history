# Refinement: Issue #10 — Comfortable-density session rows

Generated: 2026-08-14

**Issue:** https://github.com/mikemajara/agent-history/issues/10

**Selected because:** open issue with no labels, no comments, and no agent-ready status — structured skeleton exists but lacks current-state analysis, concrete layout contract, and implementation binding.

## Problem (reframed)

The session list is **compact-only**: every row is a single line whose prompt column shows at most six words (`promptSnippet`). That is good for density but weak for scanning — users cannot see enough of the first prompt (or project path on narrow terminals) without moving selection and reading the preview pane. Comfortable density should add a **multi-line row mode** that surfaces more prompt context inline while keeping compact as the default.

## Current state (main)

- **Single density.** `createBrowserState()` has no density field; `renderSessionRow()` always emits one line.
- **Compact prompt clip.** `PROMPT_WORD_LIMIT = 6` in `src/tui/render.js`; rows use `promptSnippet(session.preview)`.
- **Column layout.** `listColumnLayout()` allocates age · agent · directory (≥80 cols) · prompt · turns on one line; viewport windowing assumes **one row per session** (`rowBudget = listBudget - 1` header).
- **Preview pane is separate.** Metadata + conversation excerpt live in the side/stacked preview (`renderReferenceDetails`), not in list rows — comfortable density must not duplicate the full transcript view (#9).
- **No toggle.** `handleBrowserInput()` has no `Ctrl+O` handler; original rehaul plan (`PLAN-session-browser-rehaul.md`) deferred comfortable density here with `Ctrl+O`.
- **Prerequisites met.** Issue #2 (browser rehaul) and #13 (directory column) are closed; compact table contract is stable.

## Goal

Add an explicit **compact ↔ comfortable** density toggle. Compact stays unchanged; comfortable wraps more prompt text across a fixed number of sub-lines per session while preserving all browser state on toggle.

## Requirements

### Interaction

- **`Ctrl+O`** toggles `density` between `"compact"` (default) and `"comfortable"`.
- Toggle is available in normal and search modes (same as `Ctrl+p` preview toggle).
- Preserve **selection by session ID**, search query, scope, sort, focused control, preview-pane visibility, and list scroll anchor when density changes.
- Update `?` help and README interactive key table.

### Comfortable row layout contract

Each comfortable session occupies **up to 3 terminal rows** (1 header + 2 prompt wrap lines):

```text
{marker} {age:9} {agent:7} {directory} {turns:>5}
  {wrapped preview line 1}
  {wrapped preview line 2}
```

- **Row 1 (header):** same columns as compact — marker, age, agent, directory (when `width ≥ 80`), turns right-aligned. **No prompt on row 1.**
- **Rows 2–3:** two-space indent; wrap the **full normalized preview string** (not the 6-word snippet) to `listWidth - 2`, using existing word-wrap helpers. Clip after 2 wrap lines with trailing `…` on the last line if truncated.
- **`--no-preview`:** comfortable rows show `-` on the wrap lines (same as compact prompt column).
- **Selection styling:** inverse the entire multi-line block when selected; zebra dim applies to unselected blocks when `NO_COLOR`.
- **Minimum width 60:** hide directory column below 80 cols (same as compact); prompt wrap uses remaining width.

### Viewport / rendering

- Viewport windowing must account for **variable row height** (1 line compact, up to 3 comfortable). Walk sessions from the scroll anchor, accumulating line budget until `listBudget` is filled; do not assume `visibleWindow.length === rowBudget`.
- Column header remains one line; only session blocks grow.
- Footer reservation unchanged (3 rows).

### Out of scope

- Full scrollable transcript (#9).
- Changing compact row format or `PROMPT_WORD_LIMIT`.
- Persisting density preference across launches (optional follow-up).

## Acceptance criteria

- [ ] `Ctrl+O` toggles compact ↔ comfortable; compact rows remain single-line with 6-word prompt.
- [ ] Comfortable rows match the 3-row contract above; golden fixtures at **100×30** and **60×16** in `test/tui-render.test.js`.
- [ ] Toggling density preserves selected session, search, filter, sort, and reasonable scroll position (selected session stays visible).
- [ ] Viewport shows correct sessions when comfortable rows consume multiple lines (no overlap/truncation bugs).
- [ ] `npm test` passes; state tests cover density toggle + selection retention.
- [ ] README and `?` help document comfortable density.

## Suggested labels

`type:feat` · `priority:medium` · `agent-ready` · `status:ready`

## Recommendation

**Implement as a render + state toggle** — lower risk than #9 (no new navigation mode). Start with golden-frame tests for the comfortable row contract, then wire `Ctrl+O` and variable-height viewport windowing. Related: #2 (done), #9 (separate transcript mode).
