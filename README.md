# agent-history

`agent-history` is a terminal CLI for finding and resuming AI agent sessions across local projects.

## Install

```bash
npm i -g agent-history@latest
```

That installs both `agent-history` and the short alias `ah`.

```bash
npx agent-history
```

## Usage

```bash
ah
ah --last
agent-history
agent-history ~/github/example
agent-history --last
agent-history ls
agent-history ls .
agent-history show <id>
agent-history resume <id>
```

`ah --last` (or `agent-history --last`) launches the most recently updated session for the current directory.

## What it does

- Reads local metadata from Cursor, Claude Code, Codex, and OpenCode sessions.
- Browses sessions across all known projects or a single filtered project path.
- Searches indexed local metadata without shelling out to agent CLIs.
- Launches the selected session in its original working directory.

## Notes

- The browser starts filtered to the current directory while preloading all
  sessions, so the All filter remains immediately available.
- Type to search, use Tab to focus Filter/Sort, and use Left/Right to change
  Cwd/All or Updated/Created.
- `Ctrl+e` toggles a details panel for the selected session.
- `Esc` exits (or clears the active detail/search state); `q` remains a
  compatibility exit key.
- `Enter` resumes the selected session directly.
- Provider fields such as historical branch and model are shown only when the
  local data contains them; discovery reads local data only.

## Releasing

Publish to npm locally after preparing the release:

1. Bump `version` in `package.json` on `main`.
2. Run `npm test` and `npm pack --dry-run`.
3. Run `npm publish --otp XXXXXX`.
4. Create a matching GitHub release for that tag (for example `v0.4.0`); the workflow verifies the published npm version.

The `/publish` skill performs the release preflight and leaves the OTP-protected publish command to the user.
