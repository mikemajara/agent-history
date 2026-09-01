# Backlog Inbox

Raw ideas not yet promoted to GitHub Issues.

## Inbox

Promoted to GitHub Issues:
- #29 Pin and status-tag sessions so pending chats are visible in `ah`
- #18 Highlight the focused filter/sort control when Tabbing — **closed** (inverse highlight on focused control)
- #1 Decide safe handoff for selected session command — **closed** (no clipboard; Enter resume; open-new → #17)
- #2 Always-on TUI preview pane (side/bottom) — **closed** (always-on pane + headed table)
- #3 Cache session index for large histories — **closed** (sessions-v1.json fingerprint cache)
- #4 Add no-preview mode for sensitive sessions — **closed** (`--no-preview`)
- #5 Harden provider parsers for malformed JSONL — **closed** (skip bad lines/files; file mtime fallback)
- #11 Highlight search matches in the TUI preview pane — **closed** (match-anchored preview + term highlight)
- #12 Color-code agent badges in TUI session rows — **closed** (stable-width colored badges)
- #13 Add directory column to compact TUI rows
- #14 Search-first TUI input chrome with teaching placeholder — **closed** (bordered `/` field)
- #15 In-query `dir:`/`date:` filters; keep search generic — **closed** (dir/date tokens + docs/tests)
- #16 Keycap-styled TUI footer shortcuts — **closed** (inverse Enter + dim secondary chips)
- #17 Open new agent session from TUI — **closed** (already implemented via `Ctrl+n`)
- #20 Add fx session provider — **closed** (`src/providers/fx.js`)

Deferred / already tracked separately:
- #9 Scrollable session transcript view (full transcript; not the live preview pane)
- #10 Comfortable-density session rows (multi-line density; not the compact directory column)
- Structured `agent:` filters + Tab token complete — follow-ups under #15
