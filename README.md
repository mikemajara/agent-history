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

- The no-argument browser preloads all sessions; passing a path starts with the
  Cwd filter over that same collection.
- Type to search, use Tab to focus Filter/Sort, and use Left/Right to change
  Cwd/All or Updated/Created.
- `Ctrl+e` toggles a details panel for the selected session.
- `Esc` exits (or clears the active detail/search state); `q` remains a
  compatibility exit key.
- `Enter` prints the selected session's resume command.
- Provider fields such as historical branch and model are shown only when the
  local transcript contains them; discovery reads local files only.

## Releasing

Publishing to npm is automated via GitHub Actions when a GitHub release is published:

1. Bump `version` in `package.json` on `main`.
2. Create a GitHub release for that tag (for example `v0.1.1`).
3. The `Publish to npm` workflow runs tests and publishes with provenance.

Repository maintainers must configure an `NPM_TOKEN` secret with publish access to the `agent-history` package.
