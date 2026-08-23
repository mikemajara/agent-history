# Refinement: Issue #8 — Terminal cleanup on quit

Generated: 2026-08-23

**Issue:** https://github.com/mikemajara/agent-history/issues/8

**Selected because:** oldest open issue (no labels, no comments, one-line description). Prior refinements (2026-08-13, 2026-08-19) identified this as verify-and-close; re-verified on current main (v0.9.0).

## Problem (reframed)

Quitting the interactive browser left the full TUI frame (header, session table, preview pane, footer) in the **main terminal scrollback**. That pollutes the shell history and pushes the prompt off-screen. The original ask (“clean up as we finalize”) really means: **exit should restore the pre-`agent-history` terminal state**, not necessarily erase all scrollback with `\x1b[2J`.

## Current state (already implemented on main)

The TUI draws on the **alternate screen buffer** and restores the main screen on every exit path:

- `q` → `cleanup()` via `handleNormalInput` → `"exit"`
- `Esc` (no active search) → `cleanup()` via `handleNormalInput` → `"exit"`
- `Ctrl+C` → `cleanup()` + trailing `\n` for a clean prompt
- `Enter` / `Ctrl+n` → `cleanup()` before launching resume/new

Relevant code: `src/tui.js` (`\x1b[?1049h` on enter, `\x1b[?25h\x1b[?1049l` on cleanup). README documents: “Quitting restores your previous terminal scrollback.”

**History:** an earlier `\x1b[2J` clear-on-exit (`2ed3a0d`) was replaced by alternate-screen restore (`f3083e2`, v0.7.1) because full clear wipes prior shell output — worse UX than scrollback pollution.

## Verification (2026-08-23)

- `npm test` — **114/114 pass** on main (v0.9.0).
- `test/tui-lifecycle.test.js` asserts:
  - alternate-screen enter (`\x1b[?1049h`) on browser start
  - no full-screen clear (`\x1b[2J`) used
  - Ctrl+C cleanup emits `\x1b[?25h\x1b[?1049l` and restores raw mode
- Code review confirms `q`, `Esc`, and launch paths all call the same `cleanup()` function in `src/tui.js`.
- Dedicated lifecycle tests for `q` and `Esc` exit remain optional hardening, not a blocker.

## Goal

Verify and close this nit; no product behavior change unless manual testing finds a regression.

## Requirements

- All exit paths must leave alternate screen and restore cursor visibility.
- Main scrollback before launch must be intact after quit (alternate-screen contract).
- Do **not** revert to full-screen `\x1b[2J` clear on exit.
- Non-TTY fallback (`agent-history ls`) unchanged — no alternate screen there.

## Acceptance criteria

- [x] After `q`, `Esc`, `Ctrl+C`, or Enter→launch, prior shell scrollback is visible and the TUI frame is not appended to it (alternate-screen contract; Ctrl+C covered by test).
- [x] `npm test` — lifecycle test asserts `\x1b[?1049h` enter and `\x1b[?25h\x1b[?1049l` on Ctrl+C (`test/tui-lifecycle.test.js`).
- [ ] Optional hardening: add lifecycle tests for `q` and `Esc` exit (same cleanup sequences as Ctrl+C).
- [ ] Manual spot-check in iTerm/Terminal.app + one Linux emulator (owner).

## Suggested labels

`type:nit` · `priority:low` · `agent-ready` · `status:ready`

## Recommendation

**Close the issue** — implementation landed in `f3083e2`; automated verification passes on 2026-08-23. Remaining work is optional `q`/`Esc` lifecycle tests and a quick manual terminal check.
