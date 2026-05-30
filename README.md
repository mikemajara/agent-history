# agent-history

`agent-history` is a terminal CLI for finding and resuming AI agent sessions across local projects.

## Install

```bash
npx agent-history
```

## Usage

```bash
agent-history
agent-history .
agent-history ~/github/example
agent-history ls
agent-history ls .
agent-history show <id>
agent-history resume <id>
```

## What it does

- Reads local metadata from Cursor, Claude Code, and Codex session files.
- Browses sessions across all known projects or a single filtered project path.
- Searches indexed local metadata without shelling out to agent CLIs.
- Prints a native resume command for the selected session.

## Notes

- Search is live in the browser once activated with `/`.
- `q` exits the browser.
- `Enter` prints the selected session's resume command.
