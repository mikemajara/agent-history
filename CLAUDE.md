# agent-history

This project is a local CLI for finding and resuming AI agent sessions associated with the current repository or directory.

## Product Direction

The CLI should prioritize a rich interactive UX over a zero-dependency implementation. We chose JavaScript/Node because the ecosystem is strongest for terminal UI, packaging, and future extensibility.

The default command should be:

```bash
agent-history
```

It should open an interactive session browser filtered to the current directory. Users can pass a path to browse a different project:

```bash
agent-history ~/github/example
```

A scriptable table view should also exist:

```bash
agent-history ls
agent-history ls .
```

## Core Behavior

`agent-history` should parse local agent metadata directly from files. Listing, filtering, and search should not shell out to `claude`, `codex`, `cursor`, or other agent CLIs.

Native agent commands may be used only after the user explicitly chooses to resume or open a session.

Initial providers:

- Cursor: `~/.cursor/projects/<project-slug>/agent-transcripts/**/<session>.jsonl`
- Claude Code: `~/.claude/projects/<project-slug>/*.jsonl` and `~/.claude/history.jsonl`
- Codex: `~/.codex/sessions/**/*.jsonl` and `~/.codex/history.jsonl`
- fx: `~/.fx/sessions/index.json`, `~/.fx/sessions/<id>/session.json`, and `~/.fx/sessions/<id>/events.jsonl`

## Interactive UX Goals

The no-argument command should start filtered to the current directory in a navigable terminal UI. All known local sessions remain preloaded so users can switch to the All filter, and passing a path should filter to that project.

Expected controls:

- `j` / `k` and arrow keys move selection.
- `Enter` resumes the selected session.
- `Ctrl+n` starts a new session with that agent in the session's directory.
- `Ctrl+p` toggles the always-on preview pane (on by default; side split when wide, stacked when narrow).
- `/` searches across indexed local metadata.
- `q` exits.
- `?` shows help.

Rows should show a headed table (broader → specific):

- relative age
- agent name
- directory/project when width allows
- first few words of the first user prompt
- user-prompt turn count

The preview pane should show:

- full session id
- agent/provider
- project directory
- transcript path
- model, branch, entrypoint, and version when available
- resume command
- more prompt/context preview when available

## Session Model

Normalize all providers into a common session shape:

```ts
type AgentSession = {
  agent: "cursor" | "claude" | "codex" | "opencode" | "fx";
  id: string;
  startedAt?: Date;
  updatedAt?: Date;
  cwd?: string;
  preview?: string;
  transcriptPath?: string;
  resumeCommand?: string[];
  metadata?: Record<string, unknown>;
};
```

## Path Matching

Always normalize the target directory with `realpath` before matching.

Use provider-specific project slug encoders from the known path. Do not reverse-decode slugs by replacing hyphens with slashes, because real directory names can contain hyphens.

Fast path:

- Cursor slug: `/Users/miguel/github/foo` -> `Users-miguel-github-foo`
- Claude slug: `/Users/miguel/github/foo` -> `-Users-miguel-github-foo`

Codex should be matched by reading `session_meta.payload.cwd` from rollout JSONL files.

## Search Scope

Search must use only data parsed from local agent files. It can include:

- first user prompt
- recent prompts
- session id
- cwd/project path
- branch
- model
- agent name
- transcript metadata

Deep transcript search can be added as an opt-in mode if normal indexing becomes too slow.

## Implementation Notes

Keep the parser/indexer independent from the interactive UI. The TUI should be a view over the same normalized data used by `agent-history ls`.

Likely command shape:

```bash
agent-history          # interactive browser
agent-history ls       # scriptable table
agent-history show ID  # detailed metadata
agent-history resume ID
```

Add caching only after profiling or once Codex transcript scans feel slow. Cache location: `~/.cache/agent-history/sessions-v1.json` (fingerprint invalidation on source path/mtime/size; `--refresh` / `cache clear` to rebuild). Search BM25 index remains in-memory per browser launch.
