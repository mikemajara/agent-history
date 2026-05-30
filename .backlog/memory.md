# Backlog Memory

## Decisions

- Use JavaScript/Node for `agent-history`, prioritizing interactive terminal UX and ecosystem over a strict no-dependency implementation.
- Parse local agent metadata directly from Cursor, Claude, and Codex files for listing and search. Do not shell out to agent CLIs except when resuming/opening a selected session.
- Keep provider parsers/indexing separate from the terminal UI so `agent-history ls` and the interactive browser share the same normalized session data.
- The MVP browsing/search experience is done; remaining follow-up work is tracked in GitHub Issues.
- The selected-session handoff still needs refinement. Do not silently overwrite the clipboard by default.

## Blockers

## Project Conventions

- Default command should become the interactive session browser across all known local projects.
- Passing a path, such as `.` or `~/github/project`, should filter the browser or `agent-history ls` output to that project.
- Keep a scriptable `agent-history ls` command for table output and automation.
- Normalize paths with `realpath` before matching sessions to a project directory.

## Gotchas

- Do not reverse-decode Cursor or Claude project slugs by replacing hyphens with slashes; directory names can contain hyphens.
- Cursor's `cursor agent ls` is an interactive TUI, not a reliable non-interactive data source.
