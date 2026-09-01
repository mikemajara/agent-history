---
name: agent-history
description: >
  Find, search, pin, and status-tag local AI agent sessions with the ah /
  agent-history CLI. Use whenever the user wants to bookmark a chat, mark a
  session wip/pending/parked (or their custom statuses), find an earlier
  conversation, resume a thread, list chats for this repo, or configure the
  status list. Trigger on pin, bookmark, follow-up, park this chat, where was
  that session, agent-history, ah ls, or "mark this conversation".
---

# agent-history (`ah`)

Local CLI for browsing Cursor, Claude Code, Codex, OpenCode, and fx sessions
on disk. Listing and search read local files only — do not shell out to
`claude`, `codex`, `cursor`, or other agent CLIs except to resume or start
a session after the user chooses one.

Prefer the scriptable commands below. The interactive TUI (`ah` with no args)
is for humans.

## List and inspect

```bash
ah ls              # this directory
ah ls .            # same
ah ls ~/path       # another project
ah show <id>       # full id, pin, status, cwd, resume command, preview
```

`ah ls` columns: agent, pin, status, updated, id, project, preview.
Ids are shortened; prefix match is enough for `show` / `pin` / `status`.
This directory's current chat is usually the newest row.

## Bookmark (pin)

Pins float to the top of the browser. They are not a status.

```bash
ah pin <id>
ah unpin <id>
```

## Status

Statuses are an ordered list of strings. Defaults: `pending`, `parked`.
The first name floats and is counted in the TUI footer.

```bash
ah status <id>              # show
ah status <id> pending      # set (must be in the configured list)
ah status <id> --clear
```

Read allowed names from `ah --help` (the `status` usage line) or from config.
Do not invent names that are not in that list.

## Override the status list

`~/.config/agent-history/config.json`:

```json
{ "statuses": ["wip", "review", "done", "closed"] }
```

A top-level JSON array of strings is also valid. Missing or invalid file →
defaults. Path override: `AGENT_HISTORY_CONFIG`.

After a change, new `ah` / `ah status` processes pick it up. Names removed
from the list no longer display on existing sessions.

Annotations (pin + status per session) live at
`~/.local/share/agent-history/annotations-v1.json` (`AGENT_HISTORY_DATA_DIR`).
`--refresh` and `ah cache clear` do not delete them.

## Search

There is no `ah search` subcommand yet.

- **Human:** `ah`, then `/`, then type. Tokens: `dir:path`,
  `date:today|yesterday|week|<Nh|<Nd`. Esc leaves search. `j`/`k` move in
  browse mode; after `/`, letters go into the query.
- **Agent:** `ah ls` and match on preview / project / id. `ah show <id>`
  for one session. Do not try to drive the TUI.

## Resume

```bash
ah resume <id>     # print the resume command; do not run it unless asked
ah --last          # resume newest in this directory
ah --last --new    # new session with the last agent used here
```
