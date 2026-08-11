# agent-history

Find and resume local AI agent sessions from your terminal — Cursor, Claude Code, Codex, and OpenCode.

```bash
npm i -g agent-history@latest
# also installs the short alias: ah

npx agent-history@latest
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
ah ls                       # scriptable table
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
| Type / `/` | Search |
| `Tab` then `←` `→` | Filter Cwd/All or sort Updated/Created |
| `Esc` / `q` | Clear search or quit |

Rows are a compact table: age, agent, directory, first prompt words, turn count. The preview pane (on by default) shows metadata and as much of the conversation as fits — beside the list on wide terminals, under it when narrow.

Quitting restores your previous terminal scrollback.

## How it works

`ah` reads local session files only. Listing and search never shell out to agent CLIs; those run only when you resume or start a session.
