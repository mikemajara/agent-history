# Backlog Memory

## Decisions

- Use JavaScript/Node for `agent-history`, prioritizing interactive terminal UX and ecosystem over a strict no-dependency implementation.
- Parse local agent metadata directly from Cursor, Claude, and Codex files for listing and search. Do not shell out to agent CLIs except when resuming/opening a selected session.
- Keep provider parsers/indexing separate from the terminal UI so `agent-history ls` and the interactive browser share the same normalized session data.
- The MVP browsing/search experience is done; remaining follow-up work is tracked in GitHub Issues.
- Session open model: **Enter** resumes the selected session; **Ctrl+n** / **Alt+Enter** start a fresh session for the same agent in that session’s cwd (#17). Do not use clipboard handoff; #1 is closed.
- Keep session index rows single-line. Details live in an always-on preview pane (#2): on by default, full metadata list, `Ctrl+p` toggles; fold/remove inline `Ctrl+e` expand.
- Search stays generic in the query box. Cwd/All is the only scope chrome. MVP in-query tokens are `dir:` and `date:` only (#15). Structured `agent:` and Tab token-complete are follow-ups; free-text must still match agent names.
- TUI polish direction is inspired by `fast-resume`, but stay on the Node/readline renderer unless profiling forces a framework change. Prefer: always-on preview pane, match highlighting, colored agent badges, directory column, search-first chrome, narrow in-query filters, keycap footer.
- Do not adopt `fast-resume` terminal PNG agent art, yolo modals, or a Tantivy rewrite as part of the near-term TUI stories.

## Blockers

## Project Conventions

- Default command should become the interactive session browser across all known local projects.
- Passing a path, such as `.` or `~/github/project`, should filter the browser or `agent-history ls` output to that project.
- Keep a scriptable `agent-history ls` command for table output and automation.
- Normalize paths with `realpath` before matching sessions to a project directory.

## Gotchas

- Do not reverse-decode Cursor or Claude project slugs by replacing hyphens with slashes; directory names can contain hyphens. Recover paths by walking existing filesystem segments with longest-match (and Cursor's leading-dot stripping) instead.
- Cursor's `cursor agent ls` is an interactive TUI, not a reliable non-interactive data source.
- Cursor agent transcripts often omit `cwd`; all-project discovery should resolve the project folder slug back to a real path when the directory still exists.
