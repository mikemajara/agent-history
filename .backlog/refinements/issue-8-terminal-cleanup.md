# Refinement: Issue #8 — Terminal cleanup on quit

Generated: 2026-08-13

**Issue:** https://github.com/mikemajara/agent-history/issues/8

**Selected because:** only open issue with no labels, no comments, and a one-line description — not yet agent-ready.

## Problem (reframed)

Quitting the interactive browser left the full TUI frame (header, session table, preview pane, footer) in the **main terminal scrollback**. That pollutes the shell history and pushes the prompt off-screen. The original ask (“clean up as we finalize”) really means: **exit should restore the pre-`agent-history` terminal state**, not necessarily erase all scrollback with `\x1b[2J`.

## Current state (already implemented on main)

The TUI now draws on the **alternate screen buffer** and restores the main screen on every exit path:

- Enter → `cleanup()` before launching resume/new
- `q` / `Esc` (no active search) → `cleanup()`
- `Ctrl+C` → `cleanup()` + trailing `\n` for a clean prompt

Relevant code: `src/tui.js` (`\x1b[?1049h` on enter, `\x1b[?25h\x1b[?1049l` on cleanup). README documents: “Quitting restores your previous terminal scrollback.”

**History:** an earlier `\x1b[2J` clear-on-exit (`2ed3a0d`) was replaced by alternate-screen restore (`f3083e2`, v0.7.1) because full clear wipes prior shell output — worse UX than scrollback pollution.

## Goal

Verify and close this nit; no product behavior change unless manual testing finds a regression.

## Requirements

- All exit paths must leave alternate screen and restore cursor visibility.
- Main scrollback before launch must be intact after quit (alternate-screen contract).
- Do **not** revert to full-screen `\x1b[2J` clear on exit.
- Non-TTY fallback (`agent-history ls`) unchanged — no alternate screen there.

## Acceptance criteria

- [ ] After `q`, `Esc`, `Ctrl+C`, or Enter→launch, prior shell scrollback is visible and the TUI frame is not appended to it.
- [ ] `npm test` — lifecycle test asserts `\x1b[?1049h` enter and `\x1b[?25h\x1b[?1049l` on Ctrl+C (`test/tui-lifecycle.test.js`).
- [ ] Optional hardening: add lifecycle tests for `q` and `Esc` exit (same cleanup sequences as Ctrl+C).
- [ ] Manual spot-check in iTerm/Terminal.app + one Linux emulator.

## Suggested labels

`type:nit` · `priority:low` · `agent-ready` · `status:ready`

## Recommendation

Treat as **verify-and-close** — implementation landed in `f3083e2`; remaining work is confirmation + optional test coverage for `q`/`Esc`.
