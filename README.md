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

- Reads local metadata from Cursor, Claude Code, Codex, and OpenCode sessions.
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
  local data contains them; discovery reads local data only.

## Releasing

Publish to npm locally after preparing the release:

1. Bump `version` in `package.json` on `main`.
2. Run `npm test` and `npm pack --dry-run`.
3. Run `npm publish --otp XXXXXX`.
4. Create a matching GitHub release for that tag (for example `v0.4.0`); the workflow verifies the published npm version.

The `/publish` skill performs the release preflight and leaves the OTP-protected publish command to the user.
