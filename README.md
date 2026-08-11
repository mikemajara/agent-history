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
agent-history --last --new
agent-history ls
agent-history ls .
agent-history show <id>
agent-history resume <id>
```

`ah --last` (or `agent-history --last`) launches the most recently updated session for the current directory.

`ah --last --new` starts a fresh session with the same agent as that latest session, in the current directory. Useful as an IDE external tool / task command when you want the last agent without resuming chat history.

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
- Compact rows are a headed table, broader → specific: age, agent, directory,
  first-prompt snippet, user-turn count (directory drops on very narrow terminals).
- An always-on preview pane shows full session metadata and conversation beside
  the list on wide terminals (≥116 cols) or stacked under it on narrower ones.
  `Ctrl+p` toggles the pane.
- `Esc` exits (or clears the active search state); `q` remains a
  compatibility exit key. The browser uses the terminal alternate screen, so
  quitting restores your prior scrollback instead of wiping it.
- `Enter` resumes the selected session; `Ctrl+n` starts a new session with
  that agent in the session's directory.
- Provider fields such as historical branch and model are shown only when the
  local data contains them; discovery reads local data only.

## Releasing

Publish to npm locally after preparing the release:

1. Bump `version` in `package.json` on `main`.
2. Run `npm test` and `npm pack --dry-run`.
3. Run `npm publish --otp XXXXXX`.
4. Create a matching GitHub release for that tag (for example `v0.4.0`); the workflow verifies the published npm version.

The `/publish` skill performs the release preflight and leaves the OTP-protected publish command to the user.
