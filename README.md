# agent-history

Find and resume local AI agent sessions from your terminal — Cursor, Claude Code, Codex, and OpenCode.

```bash
npm i -g agent-history@latest
# also installs the short alias: ah

npx agent-history@latest

# later: upgrade the global install
ah --upgrade
```

## Why

You already have dozens of agent chats on disk. `ah` browses them for the current project, previews what you were doing, and resumes the one you want.

### New window, same agent — fresh chat

Some tools auto-resume the last session when you open a project. That is fine until it is not: you open Zed (or another editor), it launches into yesterday's chat, and you have to kill it and start OpenCode / Claude / Codex by hand just to get a clean thread.

Wire this instead:

```bash
ah --last --new
```

It picks the agent you last used in this directory and starts a **new** session there — same tool, no old transcript. Keep `ah --last` when you do want to continue.

## Quick start

```bash
ah                          # interactive browser for this directory
ah ~/github/example         # browse another project
ah --last                   # resume the newest session here
ah --last --new             # same agent, fresh session
ah --upgrade                # reinstall latest globally via npm
ah --no-preview             # browse without showing prompt/conversation text
ah ls                       # scriptable table
ah ls --no-preview          # table without preview column text
ah show <id>                # details
ah resume <id>              # print the resume command
```

## Interactive browser

Running `ah` opens a session browser filtered to the current directory (switch to All anytime).

| Key | Action |
| --- | --- |
| `↑` `↓` / `j` `k` | Move |
| `Enter` | Resume selected session |
| `Ctrl+n` | New session with that agent in its directory |
| `Ctrl+p` | Toggle preview pane |
| Type / `/` | Search (dedicated field; placeholder teaches `dir:` / `date:`) |
| `Tab` then `←` `→` | Filter Cwd/All or sort Updated/Created |
| `Esc` / `q` | Clear search or quit |

Rows are a compact table: age, agent, directory, first prompt words, turn count. The preview pane (on by default) shows metadata and as much of the conversation as fits — beside the list on wide terminals, under it when narrow.

Use `ah --no-preview` (or `ah ls --no-preview`) when sharing a screen: prompt snippets and conversation text stay hidden, while agent, id, path, and other metadata remain visible. Search still matches those non-preview fields (and can still match hidden prompt text to find a session, without displaying it).

### Search syntax

Type to filter. Free text matches prompts, metadata, and agent names. Optional tokens:

| Token | Meaning |
| --- | --- |
| `dir:alpha` | Path/project substring (case-insensitive) |
| `date:today` | Updated today |
| `date:yesterday` | Updated yesterday |
| `date:week` | Updated in the last 7 days |
| `date:<3h` / `date:<2d` | Updated within N hours or days |

Cwd/All still applies first. Example: `dir:agent-history date:today parser`.

With free-text terms active, the preview pane jumps to the earliest matching turn and highlights those terms. Clearing the query restores the default conversation excerpt. `dir:` / `date:` tokens are ignored when choosing highlight terms.

Conversation text in the preview also renders a small markdown subset: `**bold**`, `*italic*`, `` `code` ``, `#` headings, and `-` / `*` list bullets (`NO_COLOR` strips markers only).

Quitting restores your previous terminal scrollback.

## How it works

`ah` reads local session files only. Listing and search never shell out to agent CLIs; those run only when you resume or start a session.

### Session cache

Parsed session metadata is cached at `~/.cache/agent-history/sessions-v1.json` so repeated `ah` / `ah ls` launches skip a full transcript rescan when nothing changed.

- **Invalidation:** fingerprint of provider source files (path + mtime + size) across Cursor, Claude, Codex, and OpenCode roots.
- **Rebuild:** `ah --refresh` or `ah ls --refresh` forces a rescan and rewrite; `ah cache clear` deletes the cache file.
- **Override:** set `AGENT_HISTORY_CACHE_DIR` to relocate the cache directory.

The interactive search index (conversation text) still builds in the background after open; it is not part of this metadata cache.
